pub mod behaviour;
pub mod discovery;
pub mod gossip;
pub mod swarm;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::async_runtime::JoinHandle;
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::crdt::CrdtEngine;
use crate::protocol::identity::DirectoryEntry;
use crate::verification;

// default public relay - override with DUSK_RELAY_ADDR env var
const DEFAULT_RELAY_ADDR: &str =
    "/dns4/relay.duskchat.app/tcp/4001/p2p/12D3KooWGQkCkACcibJPKzus7Q6U1aYngfTuS4gwYwmJkJJtrSaw";

// relay reconnection parameters
const RELAY_INITIAL_BACKOFF_SECS: u64 = 2;
const RELAY_MAX_BACKOFF_SECS: u64 = 120;
const RELAY_BACKOFF_MULTIPLIER: u64 = 2;
// max time to hold pending rendezvous registrations before discarding (10 min)
const PENDING_QUEUE_TTL_SECS: u64 = 600;
// grace period before warning the frontend about relay being down,
// prevents banner flashing on transient disconnections
const RELAY_WARN_GRACE_SECS: u64 = 8;

// resolve the relay multiaddr from env var, custom setting, or default
// priority: DUSK_RELAY_ADDR env var > custom setting > DEFAULT_RELAY_ADDR
fn relay_addr(custom_addr: Option<&str>) -> Option<libp2p::Multiaddr> {
    let addr_str = std::env::var("DUSK_RELAY_ADDR")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| custom_addr.map(|s| s.to_string()))
        .or_else(|| {
            if DEFAULT_RELAY_ADDR.is_empty() {
                None
            } else {
                Some(DEFAULT_RELAY_ADDR.to_string())
            }
        })?;

    addr_str.parse().ok()
}

// extract the peer id from a multiaddr (the /p2p/<peer_id> component)
fn peer_id_from_multiaddr(addr: &libp2p::Multiaddr) -> Option<libp2p::PeerId> {
    use libp2p::multiaddr::Protocol;
    addr.iter().find_map(|p| match p {
        Protocol::P2p(peer_id) => Some(peer_id),
        _ => None,
    })
}

// handle to the running p2p node, used to stop it
pub struct NodeHandle {
    pub task: JoinHandle<()>,
    // channel to send commands to the running node
    pub command_tx: tokio::sync::mpsc::Sender<NodeCommand>,
}

// commands that can be sent to the running node
pub enum NodeCommand {
    Shutdown,
    SendMessage {
        topic: String,
        data: Vec<u8>,
    },
    Subscribe {
        topic: String,
    },
    Unsubscribe {
        topic: String,
    },
    // retrieve the swarm's external listen addresses for invite codes
    GetListenAddrs {
        reply: tokio::sync::oneshot::Sender<Vec<String>>,
    },
    // broadcast our presence status to all community presence topics
    BroadcastPresence {
        status: crate::protocol::messages::PeerStatus,
    },
    // dial a specific multiaddr (used for relay connections)
    Dial {
        addr: libp2p::Multiaddr,
    },
    // register on rendezvous under a community namespace
    RegisterRendezvous {
        namespace: String,
    },
    // discover peers on rendezvous under a community namespace
    DiscoverRendezvous {
        namespace: String,
    },
    // unregister from a rendezvous namespace we no longer participate in
    UnregisterRendezvous {
        namespace: String,
    },
    // send a gif search request to the relay peer via request-response
    GifSearch {
        request: crate::protocol::gif::GifRequest,
        reply: tokio::sync::oneshot::Sender<Result<crate::protocol::gif::GifResponse, String>>,
    },
}

// events emitted from the node to the tauri frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", content = "payload")]
pub enum DuskEvent {
    #[serde(rename = "message_received")]
    MessageReceived(crate::protocol::messages::ChatMessage),
    #[serde(rename = "message_deleted")]
    MessageDeleted { message_id: String },
    #[serde(rename = "member_kicked")]
    MemberKicked { peer_id: String },
    #[serde(rename = "peer_connected")]
    PeerConnected { peer_id: String },
    #[serde(rename = "peer_disconnected")]
    PeerDisconnected { peer_id: String },
    #[serde(rename = "presence_updated")]
    PresenceUpdated { peer_id: String, status: String },
    #[serde(rename = "typing")]
    Typing { peer_id: String, channel_id: String },
    #[serde(rename = "node_status")]
    NodeStatus {
        is_connected: bool,
        peer_count: usize,
    },
    #[serde(rename = "sync_complete")]
    SyncComplete { community_id: String },
    #[serde(rename = "profile_received")]
    ProfileReceived {
        peer_id: String,
        display_name: String,
        bio: String,
        public_key: String,
    },
    #[serde(rename = "profile_revoked")]
    ProfileRevoked { peer_id: String },
    #[serde(rename = "relay_status")]
    RelayStatus { connected: bool },
    #[serde(rename = "voice_participant_joined")]
    VoiceParticipantJoined {
        community_id: String,
        channel_id: String,
        peer_id: String,
        display_name: String,
        media_state: crate::protocol::messages::VoiceMediaState,
    },
    #[serde(rename = "voice_participant_left")]
    VoiceParticipantLeft {
        community_id: String,
        channel_id: String,
        peer_id: String,
    },
    #[serde(rename = "voice_media_state_changed")]
    VoiceMediaStateChanged {
        community_id: String,
        channel_id: String,
        peer_id: String,
        media_state: crate::protocol::messages::VoiceMediaState,
    },
    #[serde(rename = "voice_sdp_received")]
    VoiceSdpReceived {
        community_id: String,
        channel_id: String,
        from_peer: String,
        sdp_type: String,
        sdp: String,
    },
    #[serde(rename = "voice_ice_candidate_received")]
    VoiceIceCandidateReceived {
        community_id: String,
        channel_id: String,
        from_peer: String,
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u32>,
    },
    #[serde(rename = "dm_received")]
    DMReceived(crate::protocol::messages::DirectMessage),
    #[serde(rename = "dm_typing")]
    DMTyping { peer_id: String },
}

// extract the community id from a gossipsub topic string
fn community_id_from_topic(topic: &str) -> Option<&str> {
    topic
        .strip_prefix("dusk/community/")
        .and_then(|rest| rest.split('/').next())
}

// voice channel participant tracking type alias for readability
pub type VoiceChannelMap =
    Arc<Mutex<HashMap<String, Vec<crate::protocol::messages::VoiceParticipant>>>>;

// build a signed profile announcement from the keypair and storage
// used by the event loop to re-announce after relay connection or new peer joins
fn build_profile_announcement(
    keypair: &libp2p::identity::Keypair,
    storage: &crate::storage::DiskStorage,
) -> Option<crate::protocol::messages::ProfileAnnouncement> {
    let profile = storage.load_profile().ok()?;
    let proof = storage.load_verification_proof().ok().flatten();
    let peer_id = libp2p::PeerId::from(keypair.public());

    let mut announcement = crate::protocol::messages::ProfileAnnouncement {
        peer_id: peer_id.to_string(),
        display_name: profile.display_name,
        bio: profile.bio,
        public_key: hex::encode(keypair.public().encode_protobuf()),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        verification_proof: proof,
        signature: String::new(),
    };
    announcement.signature = verification::sign_announcement(keypair, &announcement);
    Some(announcement)
}

// publish our profile on the directory gossipsub topic so connected peers
// learn about us and add us to their local directory
fn publish_profile(
    swarm: &mut libp2p::Swarm<behaviour::DuskBehaviour>,
    keypair: &libp2p::identity::Keypair,
    storage: &crate::storage::DiskStorage,
) {
    if let Some(announcement) = build_profile_announcement(keypair, storage) {
        let msg = crate::protocol::messages::GossipMessage::ProfileAnnounce(announcement);
        if let Ok(data) = serde_json::to_vec(&msg) {
            let topic = libp2p::gossipsub::IdentTopic::new(gossip::topic_for_directory());
            let _ = swarm.behaviour_mut().gossipsub.publish(topic, data);
        }
    }
}

// start the p2p node on a background task
pub async fn start(
    keypair: libp2p::identity::Keypair,
    crdt_engine: Arc<Mutex<CrdtEngine>>,
    storage: Arc<crate::storage::DiskStorage>,
    app_handle: tauri::AppHandle,
    voice_channels: VoiceChannelMap,
    pending_join_role_guard: Arc<Mutex<HashSet<String>>>,
    custom_relay_addr: Option<String>,
) -> Result<NodeHandle, String> {
    let mut swarm_instance =
        swarm::build_swarm(&keypair).map_err(|e| format!("failed to build swarm: {}", e))?;

    // listen on all interfaces for LAN peer discovery via mDNS
    swarm_instance
        .listen_on("/ip4/0.0.0.0/tcp/0".parse().unwrap())
        .map_err(|e| format!("failed to listen: {}", e))?;

    let (command_tx, mut command_rx) = tokio::sync::mpsc::channel::<NodeCommand>(256);

    // emit initial node status
    let _ = app_handle.emit(
        "dusk-event",
        DuskEvent::NodeStatus {
            is_connected: false,
            peer_count: 0,
        },
    );

    // resolve the relay address for WAN connectivity
    let relay_multiaddr = relay_addr(custom_relay_addr.as_deref());
    let relay_peer_id = relay_multiaddr.as_ref().and_then(peer_id_from_multiaddr);

    // if a relay is configured, dial it immediately
    // don't emit RelayStatus here -- the store defaults to connected=true so
    // no warning shows during the initial handshake. the warning only appears
    // if the dial actually fails (OutgoingConnectionError) or the connection drops.
    if let Some(ref addr) = relay_multiaddr {
        log::info!("dialing relay at {}", addr);
        if let Err(e) = swarm_instance.dial(addr.clone()) {
            log::warn!("failed to dial relay: {}", e);
            // emit disconnected status immediately if dial fails
            let _ = app_handle.emit("dusk-event", DuskEvent::RelayStatus { connected: false });
        }
    } else {
        // if relay address is invalid or not configured, emit disconnected status
        log::warn!("no valid relay address configured, running in LAN-only mode");
        let _ = app_handle.emit("dusk-event", DuskEvent::RelayStatus { connected: false });
    }

    // clone the keypair into the event loop so it can re-announce our profile
    // when new peers connect or the relay comes online
    let node_keypair = keypair;

    let task = tauri::async_runtime::spawn(async move {
        use futures::StreamExt;

        // track connected peers for accurate count
        let mut connected_peers: HashSet<String> = HashSet::new();

        // dedup set for dm message ids -- messages arrive on both the pair topic
        // and inbox topic so we need to skip duplicates
        let mut seen_dm_ids: HashSet<String> = HashSet::new();

        // track whether we have a relay reservation
        let mut relay_reservation_active = false;

        // track the relay peer id for rendezvous operations
        let relay_peer = relay_peer_id;

        // community namespaces we need to register on rendezvous
        // queued until the relay connection is ready
        let mut pending_registrations: Vec<String> = Vec::new();
        let mut pending_discoveries: Vec<String> = Vec::new();
        // timestamp when pending items were first queued (for TTL cleanup)
        let mut pending_queued_at: Option<std::time::Instant> = None;

        // rendezvous registration refresh interval (registrations expire)
        let mut rendezvous_tick = tokio::time::interval(std::time::Duration::from_secs(120));

        // all community namespaces we're registered under (for refresh)
        let mut registered_namespaces: HashSet<String> = HashSet::new();

        // pending gif search replies keyed by request_response request id
        let mut pending_gif_replies: HashMap<
            libp2p::request_response::OutboundRequestId,
            tokio::sync::oneshot::Sender<Result<crate::protocol::gif::GifResponse, String>>,
        > = HashMap::new();

        // relay reconnection state with exponential backoff
        let mut relay_backoff_secs = RELAY_INITIAL_BACKOFF_SECS;
        // deferred warning timer -- only notify the frontend after the grace
        // period expires so transient disconnections don't flash the banner
        let mut relay_warn_at: Option<tokio::time::Instant> = None;
        // next instant at which we should attempt a relay reconnect
        let mut relay_retry_at: Option<tokio::time::Instant> = if relay_multiaddr.is_some() {
            // schedule initial retry in case the first dial failed synchronously
            Some(
                tokio::time::Instant::now()
                    + std::time::Duration::from_secs(RELAY_INITIAL_BACKOFF_SECS),
            )
        } else {
            None
        };

        loop {
            tokio::select! {
                event = swarm_instance.select_next_some() => {
                    match event {
                        // --- gossipsub messages ---
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::Gossipsub(
                            libp2p::gossipsub::Event::Message { message, .. }
                        )) => {
                            let topic_str = message.topic.as_str().to_string();

                            // handle sync messages on the dedicated sync topic
                            if topic_str == gossip::topic_for_sync() {
                                if let Ok(sync_msg) = serde_json::from_slice::<crate::crdt::sync::SyncMessage>(&message.data) {
                                    match sync_msg {
                                        crate::crdt::sync::SyncMessage::RequestSync { .. } => {
                                            let mut engine = crdt_engine.lock().await;
                                            let ids = engine.community_ids();
                                            for cid in ids {
                                                if let Some(doc_bytes) = engine.get_doc_bytes(&cid) {
                                                    let snapshot = crate::crdt::sync::DocumentSnapshot {
                                                        community_id: cid.clone(),
                                                        doc_bytes,
                                                    };
                                                    let offer = crate::crdt::sync::SyncMessage::DocumentOffer(snapshot);
                                                    if let Ok(data) = serde_json::to_vec(&offer) {
                                                        let sync_topic = libp2p::gossipsub::IdentTopic::new(gossip::topic_for_sync());
                                                        let _ = swarm_instance.behaviour_mut().gossipsub.publish(sync_topic, data);
                                                    }
                                                }
                                            }
                                        }
                                        crate::crdt::sync::SyncMessage::DocumentOffer(snapshot) => {
                                            let mut engine = crdt_engine.lock().await;

                                            // only merge docs for communities we've explicitly joined or created,
                                            // otherwise any LAN peer would push all their communities to us
                                            if !engine.has_community(&snapshot.community_id) {
                                                log::debug!("ignoring document offer for unknown community {}", snapshot.community_id);
                                                continue;
                                            }

                                            let community_id = snapshot.community_id.clone();
                                            let merge_result = engine.merge_remote_doc(&community_id, &snapshot.doc_bytes);
                                            let channels_after_merge = if merge_result.is_ok() {
                                                engine.get_channels(&community_id).unwrap_or_default()
                                            } else {
                                                Vec::new()
                                            };
                                            let mut corrected_local_role = false;
                                            let mut corrected_doc_bytes: Option<Vec<u8>> = None;
                                            if merge_result.is_ok() {
                                                let should_harden_join_role = {
                                                    let guard = pending_join_role_guard.lock().await;
                                                    guard.contains(&community_id)
                                                };

                                                if should_harden_join_role {
                                                    let local_peer_id = swarm_instance.local_peer_id().to_string();
                                                    let local_has_elevated_role = engine
                                                        .get_members(&community_id)
                                                        .map(|members| {
                                                            members.iter().any(|member| {
                                                                member.peer_id == local_peer_id
                                                                    && member.roles.iter().any(|role| role == "owner" || role == "admin")
                                                            })
                                                        })
                                                        .unwrap_or(false);

                                                    if local_has_elevated_role {
                                                        let roles = vec!["member".to_string()];
                                                        if engine.set_member_role(&community_id, &local_peer_id, &roles).is_ok() {
                                                            corrected_local_role = true;
                                                            corrected_doc_bytes = engine.get_doc_bytes(&community_id);
                                                        }
                                                    }

                                                    let mut guard = pending_join_role_guard.lock().await;
                                                    guard.remove(&community_id);
                                                }
                                            }
                                            drop(engine);

                                            match merge_result {
                                                Ok(()) => {
                                                    if let Some(doc_bytes) = corrected_doc_bytes {
                                                        let corrected_snapshot = crate::crdt::sync::DocumentSnapshot {
                                                            community_id: community_id.clone(),
                                                            doc_bytes,
                                                        };
                                                        let corrected_offer = crate::crdt::sync::SyncMessage::DocumentOffer(corrected_snapshot);
                                                        if let Ok(data) = serde_json::to_vec(&corrected_offer) {
                                                            let sync_topic = libp2p::gossipsub::IdentTopic::new(gossip::topic_for_sync());
                                                            let _ = swarm_instance.behaviour_mut().gossipsub.publish(sync_topic, data);
                                                        }
                                                    }

                                                    if corrected_local_role {
                                                        log::warn!(
                                                            "downgraded local elevated role to member during invite join sync for {}",
                                                            community_id
                                                        );
                                                    }

                                                    // keep topic subscriptions aligned with merged channels
                                                    let presence_topic = libp2p::gossipsub::IdentTopic::new(
                                                        gossip::topic_for_presence(&community_id),
                                                    );
                                                    let _ = swarm_instance
                                                        .behaviour_mut()
                                                        .gossipsub
                                                        .subscribe(&presence_topic);

                                                    for channel in &channels_after_merge {
                                                        let messages_topic = libp2p::gossipsub::IdentTopic::new(
                                                            gossip::topic_for_messages(&community_id, &channel.id),
                                                        );
                                                        let _ = swarm_instance
                                                            .behaviour_mut()
                                                            .gossipsub
                                                            .subscribe(&messages_topic);

                                                        let typing_topic = libp2p::gossipsub::IdentTopic::new(
                                                            gossip::topic_for_typing(&community_id, &channel.id),
                                                        );
                                                        let _ = swarm_instance
                                                            .behaviour_mut()
                                                            .gossipsub
                                                            .subscribe(&typing_topic);
                                                    }

                                                    let _ = app_handle.emit("dusk-event", DuskEvent::SyncComplete {
                                                        community_id,
                                                    });
                                                }
                                                Err(e) => {
                                                    log::warn!("failed to merge remote doc for {}: {}", community_id, e);
                                                }
                                            }
                                        }
                                    }
                                }
                                continue;
                            }

                            // handle regular gossip messages on community topics
                            if let Ok(gossip_msg) = serde_json::from_slice::<crate::protocol::messages::GossipMessage>(&message.data) {
                                match gossip_msg {
                                    crate::protocol::messages::GossipMessage::Chat(chat_msg) => {
                                        if let Some(community_id) = community_id_from_topic(&topic_str) {
                                            let mut engine = crdt_engine.lock().await;
                                            let _ = engine.append_message(community_id, &chat_msg);
                                        }
                                        let _ = app_handle.emit("dusk-event", DuskEvent::MessageReceived(chat_msg));
                                    }
                                    crate::protocol::messages::GossipMessage::Typing(indicator) => {
                                        let _ = app_handle.emit("dusk-event", DuskEvent::Typing {
                                            peer_id: indicator.peer_id,
                                            channel_id: indicator.channel_id,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::DeleteMessage { message_id } => {
                                        if let Some(community_id) = community_id_from_topic(&topic_str) {
                                            let mut engine = crdt_engine.lock().await;
                                            let _ = engine.delete_message(community_id, &message_id);
                                        }
                                        let _ = app_handle.emit("dusk-event", DuskEvent::MessageDeleted { message_id });
                                    }
                                    crate::protocol::messages::GossipMessage::MemberKicked { peer_id } => {
                                        if let Some(community_id) = community_id_from_topic(&topic_str) {
                                            let mut engine = crdt_engine.lock().await;
                                            let _ = engine.remove_member(community_id, &peer_id);
                                        }
                                        let _ = app_handle.emit("dusk-event", DuskEvent::MemberKicked { peer_id });
                                    }
                                    crate::protocol::messages::GossipMessage::Presence(update) => {
                                        // map PeerStatus to a string the frontend understands
                                        let status_str = match &update.status {
                                            crate::protocol::messages::PeerStatus::Online => "Online",
                                            crate::protocol::messages::PeerStatus::Idle => "Idle",
                                            crate::protocol::messages::PeerStatus::Dnd => "Dnd",
                                            crate::protocol::messages::PeerStatus::Offline => "Offline",
                                        };
                                        let _ = app_handle.emit("dusk-event", DuskEvent::PresenceUpdated {
                                            peer_id: update.peer_id.clone(),
                                            status: status_str.to_string(),
                                        });

                                        // also update online/offline tracking based on status
                                        match update.status {
                                            crate::protocol::messages::PeerStatus::Offline => {
                                                let _ = app_handle.emit("dusk-event", DuskEvent::PeerDisconnected {
                                                    peer_id: update.peer_id,
                                                });
                                            }
                                            _ => {
                                                let _ = app_handle.emit("dusk-event", DuskEvent::PeerConnected {
                                                    peer_id: update.peer_id,
                                                });
                                            }
                                        }
                                    }
                                    crate::protocol::messages::GossipMessage::MetaUpdate(meta) => {
                                        let _ = app_handle.emit("dusk-event", DuskEvent::SyncComplete {
                                            community_id: meta.id,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::ProfileAnnounce(profile) => {
                                        // reject announcements with invalid signatures
                                        if !verification::verify_announcement(&profile.public_key, &profile) {
                                            log::warn!("rejected unsigned/invalid profile from {}", profile.peer_id);
                                            continue;
                                        }

                                        // reject unverified identities
                                        if profile.verification_proof.is_none() {
                                            log::warn!("rejected unverified profile from {}", profile.peer_id);
                                            continue;
                                        }

                                        // cache the peer profile in our local directory
                                        let entry = DirectoryEntry {
                                            peer_id: profile.peer_id.clone(),
                                            display_name: profile.display_name.clone(),
                                            bio: profile.bio.clone(),
                                            public_key: profile.public_key.clone(),
                                            last_seen: profile.timestamp,
                                            is_friend: storage
                                                .load_directory()
                                                .ok()
                                                .and_then(|d| d.get(&profile.peer_id).map(|e| e.is_friend))
                                                .unwrap_or(false),
                                        };
                                        let _ = storage.save_directory_entry(&entry);

                                        let _ = app_handle.emit("dusk-event", DuskEvent::ProfileReceived {
                                            peer_id: profile.peer_id,
                                            display_name: profile.display_name,
                                            bio: profile.bio,
                                            public_key: profile.public_key,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::ProfileRevoke(revocation) => {
                                        // reject revocations with invalid signatures
                                        if !verification::verify_revocation(&revocation.public_key, &revocation) {
                                            log::warn!("rejected unsigned revocation for {}", revocation.peer_id);
                                            continue;
                                        }

                                        // peer is revoking their identity, remove them from our directory
                                        let _ = storage.remove_directory_entry(&revocation.peer_id);

                                        let _ = app_handle.emit("dusk-event", DuskEvent::ProfileRevoked {
                                            peer_id: revocation.peer_id,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::VoiceJoin {
                                        community_id, channel_id, peer_id, display_name, media_state,
                                    } => {
                                        let participant = crate::protocol::messages::VoiceParticipant {
                                            peer_id: peer_id.clone(),
                                            display_name: display_name.clone(),
                                            media_state: media_state.clone(),
                                        };

                                        // track the participant in shared voice state
                                        let key = format!("{}:{}", community_id, channel_id);
                                        let mut vc = voice_channels.lock().await;
                                        let participants = vc.entry(key).or_insert_with(Vec::new);
                                        // avoid duplicates if we receive a repeated join
                                        participants.retain(|p| p.peer_id != peer_id);
                                        participants.push(participant);
                                        drop(vc);

                                        let _ = app_handle.emit("dusk-event", DuskEvent::VoiceParticipantJoined {
                                            community_id, channel_id, peer_id, display_name, media_state,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::VoiceLeave {
                                        community_id, channel_id, peer_id,
                                    } => {
                                        let key = format!("{}:{}", community_id, channel_id);
                                        let mut vc = voice_channels.lock().await;
                                        if let Some(participants) = vc.get_mut(&key) {
                                            participants.retain(|p| p.peer_id != peer_id);
                                            if participants.is_empty() {
                                                vc.remove(&key);
                                            }
                                        }
                                        drop(vc);

                                        let _ = app_handle.emit("dusk-event", DuskEvent::VoiceParticipantLeft {
                                            community_id, channel_id, peer_id,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::VoiceMediaStateUpdate {
                                        community_id, channel_id, peer_id, media_state,
                                    } => {
                                        // update tracked media state for this participant
                                        let key = format!("{}:{}", community_id, channel_id);
                                        let mut vc = voice_channels.lock().await;
                                        if let Some(participants) = vc.get_mut(&key) {
                                            if let Some(p) = participants.iter_mut().find(|p| p.peer_id == peer_id) {
                                                p.media_state = media_state.clone();
                                            }
                                        }
                                        drop(vc);

                                        let _ = app_handle.emit("dusk-event", DuskEvent::VoiceMediaStateChanged {
                                            community_id, channel_id, peer_id, media_state,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::VoiceSdp {
                                        community_id, channel_id, from_peer, to_peer, sdp_type, sdp,
                                    } => {
                                        // only forward sdp messages addressed to us
                                        let local_id = swarm_instance.local_peer_id().to_string();
                                        if to_peer == local_id {
                                            let _ = app_handle.emit("dusk-event", DuskEvent::VoiceSdpReceived {
                                                community_id, channel_id, from_peer, sdp_type, sdp,
                                            });
                                        }
                                    }
                                    crate::protocol::messages::GossipMessage::VoiceIceCandidate {
                                        community_id, channel_id, from_peer, to_peer, candidate, sdp_mid, sdp_mline_index,
                                    } => {
                                        // only forward ice candidates addressed to us
                                        let local_id = swarm_instance.local_peer_id().to_string();
                                        if to_peer == local_id {
                                            let _ = app_handle.emit("dusk-event", DuskEvent::VoiceIceCandidateReceived {
                                                community_id, channel_id, from_peer, candidate, sdp_mid, sdp_mline_index,
                                            });
                                        }
                                    }
                                    crate::protocol::messages::GossipMessage::DirectMessage(dm_msg) => {
                                        // only process dms addressed to us (ignore our own echoes)
                                        let local_id = swarm_instance.local_peer_id().to_string();
                                        if dm_msg.to_peer == local_id {
                                            // dedup: messages arrive on both the pair topic and inbox
                                            // topic so skip if we've already processed this one
                                            if !seen_dm_ids.insert(dm_msg.id.clone()) {
                                                continue;
                                            }
                                            // cap the dedup set to prevent unbounded memory growth
                                            if seen_dm_ids.len() > 10000 {
                                                seen_dm_ids.clear();
                                            }

                                            // if this arrived on the inbox topic, the sender might be
                                            // someone we've never dm'd before -- auto-subscribe to the
                                            // pair topic so subsequent messages use the direct channel
                                            if topic_str.starts_with("dusk/dm/inbox/") {
                                                let pair_topic = gossip::topic_for_dm(&dm_msg.from_peer, &dm_msg.to_peer);
                                                let ident_topic = libp2p::gossipsub::IdentTopic::new(pair_topic);
                                                let _ = swarm_instance.behaviour_mut().gossipsub.subscribe(&ident_topic);
                                            }

                                            // persist the incoming message
                                            let conversation_id = gossip::dm_conversation_id(&dm_msg.from_peer, &dm_msg.to_peer);
                                            let _ = storage.append_dm_message(&conversation_id, &dm_msg);

                                            // update or create conversation metadata
                                            let existing = storage.load_dm_conversation(&conversation_id).ok();
                                            let meta = crate::protocol::messages::DMConversationMeta {
                                                peer_id: dm_msg.from_peer.clone(),
                                                display_name: dm_msg.from_display_name.clone(),
                                                last_message: Some(dm_msg.content.clone()),
                                                last_message_time: Some(dm_msg.timestamp),
                                                unread_count: existing.map(|m| m.unread_count + 1).unwrap_or(1),
                                            };
                                            let _ = storage.save_dm_conversation(&conversation_id, &meta);

                                            let _ = app_handle.emit("dusk-event", DuskEvent::DMReceived(dm_msg));
                                        }
                                    }
                                    crate::protocol::messages::GossipMessage::DMTyping(indicator) => {
                                        let local_id = swarm_instance.local_peer_id().to_string();
                                        if indicator.to_peer == local_id {
                                            let _ = app_handle.emit("dusk-event", DuskEvent::DMTyping {
                                                peer_id: indicator.from_peer,
                                            });
                                        }
                                    }
                                }
                            }
                        }

                        // --- mDNS discovery (LAN) ---
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::Mdns(
                            libp2p::mdns::Event::Discovered(peers)
                        )) => {
                            for (peer_id, addr) in &peers {
                                swarm_instance.behaviour_mut().gossipsub.add_explicit_peer(peer_id);
                                swarm_instance.behaviour_mut().kademlia.add_address(peer_id, addr.clone());
                                connected_peers.insert(peer_id.to_string());
                                let _ = app_handle.emit("dusk-event", DuskEvent::PeerConnected {
                                    peer_id: peer_id.to_string(),
                                });
                            }
                            let _ = app_handle.emit("dusk-event", DuskEvent::NodeStatus {
                                is_connected: !connected_peers.is_empty(),
                                peer_count: connected_peers.len(),
                            });

                            // sync documents and announce profile to newly discovered LAN peers
                            if !peers.is_empty() {
                                let local_peer_id = *swarm_instance.local_peer_id();
                                let request = crate::crdt::sync::SyncMessage::RequestSync {
                                    peer_id: local_peer_id.to_string(),
                                };
                                if let Ok(data) = serde_json::to_vec(&request) {
                                    let sync_topic = libp2p::gossipsub::IdentTopic::new(gossip::topic_for_sync());
                                    let _ = swarm_instance.behaviour_mut().gossipsub.publish(sync_topic, data);
                                }

                                publish_profile(&mut swarm_instance, &node_keypair, &storage);
                            }
                        }
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::Mdns(
                            libp2p::mdns::Event::Expired(peers)
                        )) => {
                            for (peer_id, _) in peers {
                                swarm_instance.behaviour_mut().gossipsub.remove_explicit_peer(&peer_id);
                                connected_peers.remove(&peer_id.to_string());
                                let _ = app_handle.emit("dusk-event", DuskEvent::PeerDisconnected {
                                    peer_id: peer_id.to_string(),
                                });
                            }
                            let _ = app_handle.emit("dusk-event", DuskEvent::NodeStatus {
                                is_connected: !connected_peers.is_empty(),
                                peer_count: connected_peers.len(),
                            });
                        }

                        // --- relay client events ---
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::RelayClient(
                            libp2p::relay::client::Event::ReservationReqAccepted { relay_peer_id, .. }
                        )) => {
                            log::info!("relay reservation accepted by {}", relay_peer_id);
                            relay_reservation_active = true;
                            relay_warn_at = None;
                            let _ = app_handle.emit("dusk-event", DuskEvent::RelayStatus { connected: true });

                            // now that we have a relay reservation, process any pending
                            // rendezvous registrations that were queued before the relay was ready
                            let queued = std::mem::take(&mut pending_registrations);
                            for ns in queued {
                                if let Some(rp) = relay_peer {
                                    match libp2p::rendezvous::Namespace::new(ns.clone()) {
                                        Ok(namespace) => {
                                            if let Err(e) = swarm_instance.behaviour_mut().rendezvous.register(
                                                namespace,
                                                rp,
                                                None,
                                            ) {
                                                log::warn!("failed to register on rendezvous for {}: {:?}", ns, e);
                                            } else {
                                                registered_namespaces.insert(ns);
                                            }
                                        }
                                        Err(e) => {
                                            log::warn!("invalid rendezvous namespace '{}': {:?}", ns, e);
                                        }
                                    }
                                }
                            }

                            let queued = std::mem::take(&mut pending_discoveries);
                            for ns in queued {
                                if let Some(rp) = relay_peer {
                                    swarm_instance.behaviour_mut().rendezvous.discover(
                                        Some(libp2p::rendezvous::Namespace::new(ns.clone()).unwrap()),
                                        None,
                                        None,
                                        rp,
                                    );
                                }
                            }

                            // queues drained, reset the TTL tracker
                            pending_queued_at = None;

                            // re-announce our profile now that the relay is up
                            // the initial announcement in start_node fires before
                            // any WAN peers are reachable, so this ensures remote
                            // peers learn about us once the relay mesh is live
                            publish_profile(&mut swarm_instance, &node_keypair, &storage);
                        }

                        // --- rendezvous client events ---
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::Rendezvous(
                            libp2p::rendezvous::client::Event::Registered { namespace, .. }
                        )) => {
                            log::info!("registered on rendezvous under namespace '{}'", namespace);
                            registered_namespaces.insert(namespace.to_string());
                        }
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::Rendezvous(
                            libp2p::rendezvous::client::Event::Discovered { registrations, .. }
                        )) => {
                            // discovered peers on rendezvous, connect to them through the relay
                            for registration in registrations {
                                let discovered_peer = registration.record.peer_id();
                                let local_id = *swarm_instance.local_peer_id();

                                // don't connect to ourselves
                                if discovered_peer == local_id {
                                    continue;
                                }

                                // never expose relay infrastructure in the user directory
                                if Some(discovered_peer) == relay_peer {
                                    continue;
                                }

                                log::info!("discovered peer {} via rendezvous", discovered_peer);

                                // cache a placeholder entry so global discovery is visible
                                // before we receive the peer's signed profile announcement
                                let now = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64;
                                let discovered_peer_str = discovered_peer.to_string();
                                let already_known = storage
                                    .load_directory()
                                    .ok()
                                    .map(|d| d.contains_key(&discovered_peer_str))
                                    .unwrap_or(false);

                                // add a lightweight placeholder if we have not learned this peer's profile yet
                                if !already_known {
                                    let placeholder = DirectoryEntry {
                                        peer_id: discovered_peer_str.clone(),
                                        display_name: "discovered peer".to_string(),
                                        bio: String::new(),
                                        public_key: String::new(),
                                        last_seen: now,
                                        is_friend: false,
                                    };
                                    let _ = storage.save_directory_entry(&placeholder);

                                    let _ = app_handle.emit("dusk-event", DuskEvent::ProfileReceived {
                                        peer_id: placeholder.peer_id,
                                        display_name: placeholder.display_name,
                                        bio: placeholder.bio,
                                        public_key: placeholder.public_key,
                                    });
                                }

                                // connect through the relay circuit so neither peer reveals their IP
                                if let Some(ref relay_addr) = relay_multiaddr {
                                    let circuit_addr = relay_addr.clone()
                                        .with(libp2p::multiaddr::Protocol::P2pCircuit)
                                        .with(libp2p::multiaddr::Protocol::P2p(discovered_peer));

                                    if let Err(e) = swarm_instance.dial(circuit_addr) {
                                        log::warn!("failed to dial peer {} through relay: {}", discovered_peer, e);
                                    }
                                }
                            }
                        }
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::Rendezvous(
                            libp2p::rendezvous::client::Event::RegisterFailed { namespace, error, .. }
                        )) => {
                            log::warn!("rendezvous registration failed for '{}': {:?}", namespace, error);
                        }

                        // --- identify events ---
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::Identify(
                            libp2p::identify::Event::Received { peer_id, info, .. }
                        )) => {
                            // add observed addresses to kademlia so peers can find each other
                            for addr in &info.listen_addrs {
                                swarm_instance.behaviour_mut().kademlia.add_address(&peer_id, addr.clone());
                            }
                            log::debug!("identified peer {}: {} addresses", peer_id, info.listen_addrs.len());
                        }

                        // --- outgoing dial failures ---
                        libp2p::swarm::SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
                            // if this was a failed dial to the relay, schedule a retry
                            if let Some(failed_peer) = peer_id {
                                if Some(failed_peer) == relay_peer {
                                    log::warn!("failed to connect to relay: {}", error);
                                    log::info!("scheduling relay reconnect in {}s", relay_backoff_secs);
                                    // defer the warning so transient failures don't flash the banner
                                    if relay_warn_at.is_none() {
                                        relay_warn_at = Some(
                                            tokio::time::Instant::now()
                                                + std::time::Duration::from_secs(RELAY_WARN_GRACE_SECS),
                                        );
                                    }
                                    relay_retry_at = Some(
                                        tokio::time::Instant::now() + std::time::Duration::from_secs(relay_backoff_secs),
                                    );
                                    // exponential backoff capped at max
                                    relay_backoff_secs = (relay_backoff_secs * RELAY_BACKOFF_MULTIPLIER)
                                        .min(RELAY_MAX_BACKOFF_SECS);
                                }
                            }
                        }

                        // --- connection lifecycle ---
                        libp2p::swarm::SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                            // add to gossipsub mesh for WAN peers (mDNS handles LAN peers)
                            swarm_instance.behaviour_mut().gossipsub.add_explicit_peer(&peer_id);
                            connected_peers.insert(peer_id.to_string());

                            let _ = app_handle.emit("dusk-event", DuskEvent::PeerConnected {
                                peer_id: peer_id.to_string(),
                            });
                            let _ = app_handle.emit("dusk-event", DuskEvent::NodeStatus {
                                is_connected: true,
                                peer_count: connected_peers.len(),
                            });

                            // if we just connected to the relay, make a reservation
                            // so other peers can reach us through it
                            if Some(peer_id) == relay_peer && !relay_reservation_active {
                                // reset backoff on successful connection
                                relay_backoff_secs = RELAY_INITIAL_BACKOFF_SECS;
                                // cancel any pending retry and deferred warning
                                relay_retry_at = None;
                                relay_warn_at = None;
                                // clear the banner if it was already showing
                                let _ = app_handle.emit("dusk-event", DuskEvent::RelayStatus { connected: true });

                                if let Some(ref addr) = relay_multiaddr {
                                    let relay_circuit_addr = addr.clone()
                                        .with(libp2p::multiaddr::Protocol::P2pCircuit);

                                    log::info!("connected to relay, requesting reservation");
                                    if let Err(e) = swarm_instance.listen_on(relay_circuit_addr) {
                                        log::warn!("failed to listen on relay circuit: {}", e);
                                    }
                                }
                            }

                            // request sync from newly connected peers
                            let local_peer_id = *swarm_instance.local_peer_id();
                            let request = crate::crdt::sync::SyncMessage::RequestSync {
                                peer_id: local_peer_id.to_string(),
                            };
                            if let Ok(data) = serde_json::to_vec(&request) {
                                let sync_topic = libp2p::gossipsub::IdentTopic::new(gossip::topic_for_sync());
                                let _ = swarm_instance.behaviour_mut().gossipsub.publish(sync_topic, data);
                            }

                            // re-announce our profile so the new peer adds us to
                            // their directory. skip the relay itself since it does
                            // not participate in the gossipsub directory mesh.
                            if Some(peer_id) != relay_peer {
                                publish_profile(&mut swarm_instance, &node_keypair, &storage);
                            }
                        }
                        libp2p::swarm::SwarmEvent::ConnectionClosed { peer_id, num_established, .. } => {
                            if num_established == 0 {
                                connected_peers.remove(&peer_id.to_string());

                                // remove disconnected peer from all voice channels and notify frontend
                                let peer_id_str = peer_id.to_string();
                                let mut vc = voice_channels.lock().await;
                                let mut empty_keys = Vec::new();
                                for (key, participants) in vc.iter_mut() {
                                    let before_len = participants.len();
                                    participants.retain(|p| p.peer_id != peer_id_str);
                                    if participants.len() < before_len {
                                        // parse the key back into community_id and channel_id
                                        if let Some((cid, chid)) = key.split_once(':') {
                                            let _ = app_handle.emit("dusk-event", DuskEvent::VoiceParticipantLeft {
                                                community_id: cid.to_string(),
                                                channel_id: chid.to_string(),
                                                peer_id: peer_id_str.clone(),
                                            });
                                        }
                                    }
                                    if participants.is_empty() {
                                        empty_keys.push(key.clone());
                                    }
                                }
                                for key in empty_keys {
                                    vc.remove(&key);
                                }
                                drop(vc);

                                let _ = app_handle.emit("dusk-event", DuskEvent::PeerDisconnected {
                                    peer_id: peer_id.to_string(),
                                });
                                let _ = app_handle.emit("dusk-event", DuskEvent::NodeStatus {
                                    is_connected: !connected_peers.is_empty(),
                                    peer_count: connected_peers.len(),
                                });

                                // if we lost the relay connection, mark reservation as inactive
                                // and schedule a retry with backoff
                                if Some(peer_id) == relay_peer {
                                    relay_reservation_active = false;
                                    log::warn!("lost connection to relay, scheduling reconnect in {}s", relay_backoff_secs);
                                    // defer the warning so quick reconnections don't flash the banner
                                    if relay_warn_at.is_none() {
                                        relay_warn_at = Some(
                                            tokio::time::Instant::now()
                                                + std::time::Duration::from_secs(RELAY_WARN_GRACE_SECS),
                                        );
                                    }

                                    relay_retry_at = Some(
                                        tokio::time::Instant::now() + std::time::Duration::from_secs(relay_backoff_secs),
                                    );
                                    relay_backoff_secs = (relay_backoff_secs * RELAY_BACKOFF_MULTIPLIER)
                                        .min(RELAY_MAX_BACKOFF_SECS);
                                }
                            }
                        }

                        // gif service response from relay
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::GifService(
                            libp2p::request_response::Event::Message {
                                message: libp2p::request_response::Message::Response { request_id, response },
                                ..
                            }
                        )) => {
                            if let Some(reply) = pending_gif_replies.remove(&request_id) {
                                let _ = reply.send(Ok(response));
                            }
                        }
                        // gif service outbound failure
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::GifService(
                            libp2p::request_response::Event::OutboundFailure { request_id, error, .. }
                        )) => {
                            if let Some(reply) = pending_gif_replies.remove(&request_id) {
                                let _ = reply.send(Err(format!("gif request failed: {:?}", error)));
                            }
                        }
                        // ignore inbound requests (we only send outbound) and other events
                        libp2p::swarm::SwarmEvent::Behaviour(behaviour::DuskBehaviourEvent::GifService(_)) => {}

                        _ => {}
                    }
                }

                // periodic rendezvous re-registration (registrations expire on the server)
                _ = rendezvous_tick.tick() => {
                    if relay_reservation_active {
                        if let Some(rp) = relay_peer {
                            for ns in registered_namespaces.clone() {
                                if let Err(e) = swarm_instance.behaviour_mut().rendezvous.register(
                                    libp2p::rendezvous::Namespace::new(ns.clone()).unwrap(),
                                    rp,
                                    None,
                                ) {
                                    log::warn!("failed to refresh rendezvous registration for {}: {:?}", ns, e);
                                }
                            }
                        }
                    }

                    // clean up stale pending registrations/discoveries that have been
                    // queued too long without a relay connection
                    if let Some(queued_at) = pending_queued_at {
                        if queued_at.elapsed() > std::time::Duration::from_secs(PENDING_QUEUE_TTL_SECS) {
                            if !pending_registrations.is_empty() || !pending_discoveries.is_empty() {
                                log::warn!(
                                    "discarding {} pending registrations and {} pending discoveries (relay unavailable for {}s)",
                                    pending_registrations.len(),
                                    pending_discoveries.len(),
                                    PENDING_QUEUE_TTL_SECS,
                                );
                                pending_registrations.clear();
                                pending_discoveries.clear();
                                pending_queued_at = None;
                            }
                        }
                    }
                }

                // relay reconnection with exponential backoff
                _ = tokio::time::sleep_until(
                    relay_retry_at.unwrap_or_else(|| tokio::time::Instant::now() + std::time::Duration::from_secs(86400))
                ), if relay_retry_at.is_some() => {
                    relay_retry_at = None;
                    if !relay_reservation_active {
                        if let Some(ref addr) = relay_multiaddr {
                            log::info!("attempting relay reconnect to {}", addr);
                            if let Err(e) = swarm_instance.dial(addr.clone()) {
                                log::warn!("failed to dial relay: {}", e);
                                // schedule another retry
                                relay_retry_at = Some(
                                    tokio::time::Instant::now() + std::time::Duration::from_secs(relay_backoff_secs),
                                );
                                relay_backoff_secs = (relay_backoff_secs * RELAY_BACKOFF_MULTIPLIER)
                                    .min(RELAY_MAX_BACKOFF_SECS);
                            }
                        }
                    }
                }

                // deferred relay warning -- only tell the frontend after the grace
                // period so transient disconnections don't flash the banner
                _ = tokio::time::sleep_until(
                    relay_warn_at.unwrap_or_else(|| tokio::time::Instant::now() + std::time::Duration::from_secs(86400))
                ), if relay_warn_at.is_some() => {
                    relay_warn_at = None;
                    // grace period expired and we still don't have a relay connection
                    if !relay_reservation_active {
                        let _ = app_handle.emit("dusk-event", DuskEvent::RelayStatus { connected: false });
                    }
                }

                cmd = command_rx.recv() => {
                    match cmd {
                        Some(NodeCommand::Shutdown) | None => break,
                        Some(NodeCommand::SendMessage { topic, data }) => {
                            let ident_topic = libp2p::gossipsub::IdentTopic::new(topic);
                            let _ = swarm_instance.behaviour_mut().gossipsub.publish(ident_topic, data);
                        }
                        Some(NodeCommand::Subscribe { topic }) => {
                            let ident_topic = libp2p::gossipsub::IdentTopic::new(topic);
                            let _ = swarm_instance.behaviour_mut().gossipsub.subscribe(&ident_topic);
                        }
                        Some(NodeCommand::Unsubscribe { topic }) => {
                            let ident_topic = libp2p::gossipsub::IdentTopic::new(topic);
                            let _ = swarm_instance.behaviour_mut().gossipsub.unsubscribe(&ident_topic);
                        }
                        Some(NodeCommand::GetListenAddrs { reply }) => {
                            let addrs: Vec<String> = swarm_instance
                                .listeners()
                                .map(|a| a.to_string())
                                .collect();
                            let _ = reply.send(addrs);
                        }
                        Some(NodeCommand::Dial { addr }) => {
                            if let Err(e) = swarm_instance.dial(addr.clone()) {
                                log::warn!("failed to dial {}: {}", addr, e);
                            }
                        }
                        Some(NodeCommand::BroadcastPresence { status }) => {
                            // publish presence update on every subscribed community presence topic
                            let local_id = swarm_instance.local_peer_id().to_string();
                            let display_name = storage
                                .load_profile()
                                .map(|p| p.display_name)
                                .unwrap_or_else(|_| "unknown".to_string());
                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64;
                            let update = crate::protocol::messages::PresenceUpdate {
                                peer_id: local_id,
                                display_name,
                                status,
                                timestamp: now,
                            };
                            let msg = crate::protocol::messages::GossipMessage::Presence(update);
                            if let Ok(data) = serde_json::to_vec(&msg) {
                                // broadcast to every community presence topic we're subscribed to
                                let engine = crdt_engine.lock().await;
                                let community_ids = engine.community_ids();
                                drop(engine);
                                for cid in community_ids {
                                    let topic_str = gossip::topic_for_presence(&cid);
                                    let ident_topic = libp2p::gossipsub::IdentTopic::new(topic_str);
                                    let _ = swarm_instance.behaviour_mut().gossipsub.publish(ident_topic, data.clone());
                                }
                            }
                        }
                        Some(NodeCommand::RegisterRendezvous { namespace }) => {
                            if relay_reservation_active {
                                if let Some(rp) = relay_peer {
                                    match libp2p::rendezvous::Namespace::new(namespace.clone()) {
                                        Ok(ns) => {
                                            if let Err(e) = swarm_instance.behaviour_mut().rendezvous.register(ns, rp, None) {
                                                log::warn!("failed to register on rendezvous: {:?}", e);
                                            } else {
                                                registered_namespaces.insert(namespace);
                                            }
                                        }
                                        Err(e) => log::warn!("invalid rendezvous namespace '{}': {:?}", namespace, e),
                                    }
                                }
                            } else {
                                // queue for later once relay is ready
                                if pending_queued_at.is_none() {
                                    pending_queued_at = Some(std::time::Instant::now());
                                }
                                pending_registrations.push(namespace);
                            }
                        }
                        Some(NodeCommand::DiscoverRendezvous { namespace }) => {
                            if relay_reservation_active {
                                if let Some(rp) = relay_peer {
                                    match libp2p::rendezvous::Namespace::new(namespace.clone()) {
                                        Ok(ns) => {
                                            swarm_instance.behaviour_mut().rendezvous.discover(
                                                Some(ns),
                                                None,
                                                None,
                                                rp,
                                            );
                                        }
                                        Err(e) => log::warn!("invalid rendezvous namespace '{}': {:?}", namespace, e),
                                    }
                                }
                            } else {
                                // queue for later once relay is ready
                                if pending_queued_at.is_none() {
                                    pending_queued_at = Some(std::time::Instant::now());
                                }
                                pending_discoveries.push(namespace);
                            }
                        }
                        Some(NodeCommand::UnregisterRendezvous { namespace }) => {
                            pending_registrations.retain(|ns| ns != &namespace);
                            pending_discoveries.retain(|ns| ns != &namespace);
                            if pending_registrations.is_empty() && pending_discoveries.is_empty() {
                                pending_queued_at = None;
                            }
                            registered_namespaces.remove(&namespace);

                            if relay_reservation_active {
                                if let Some(rp) = relay_peer {
                                    match libp2p::rendezvous::Namespace::new(namespace.clone()) {
                                        Ok(ns) => {
                                            swarm_instance.behaviour_mut().rendezvous.unregister(ns, rp);
                                        }
                                        Err(e) => log::warn!(
                                            "invalid rendezvous namespace '{}': {:?}",
                                            namespace,
                                            e
                                        ),
                                    }
                                }
                            }
                        }
                        Some(NodeCommand::GifSearch { request, reply }) => {
                            if let Some(rp) = relay_peer {
                                let request_id = swarm_instance
                                    .behaviour_mut()
                                    .gif_service
                                    .send_request(&rp, request);
                                pending_gif_replies.insert(request_id, reply);
                            } else {
                                let _ = reply.send(Err("not connected to relay".to_string()));
                            }
                        }
                    }
                }
            }
        }

        log::info!("p2p node event loop exited");
    });

    Ok(NodeHandle { task, command_tx })
}
