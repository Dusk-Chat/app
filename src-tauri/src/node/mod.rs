pub mod behaviour;
pub mod discovery;
pub mod gossip;
pub mod swarm;

use std::collections::HashSet;
use std::sync::Arc;
use tauri::async_runtime::JoinHandle;
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::crdt::CrdtEngine;
use crate::protocol::identity::DirectoryEntry;

// default relay address - override with DUSK_RELAY_ADDR env var
// format: /ip4/<ip>/tcp/<port>/p2p/<peer_id>
// left empty because 0.0.0.0 is a listen address, not a routable dial target.
// users must set DUSK_RELAY_ADDR to a reachable relay for WAN connectivity.
const DEFAULT_RELAY_ADDR: &str = "";

// relay reconnection parameters
const RELAY_INITIAL_BACKOFF_SECS: u64 = 2;
const RELAY_MAX_BACKOFF_SECS: u64 = 120;
const RELAY_BACKOFF_MULTIPLIER: u64 = 2;
// max time to hold pending rendezvous registrations before discarding (10 min)
const PENDING_QUEUE_TTL_SECS: u64 = 600;

// resolve the relay multiaddr from env or default
fn relay_addr() -> Option<libp2p::Multiaddr> {
    let addr_str = std::env::var("DUSK_RELAY_ADDR")
        .ok()
        .filter(|s| !s.is_empty())
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
    },
    #[serde(rename = "profile_revoked")]
    ProfileRevoked { peer_id: String },
}

// extract the community id from a gossipsub topic string
fn community_id_from_topic(topic: &str) -> Option<&str> {
    topic
        .strip_prefix("dusk/community/")
        .and_then(|rest| rest.split('/').next())
}

// start the p2p node on a background task
pub async fn start(
    keypair: libp2p::identity::Keypair,
    crdt_engine: Arc<Mutex<CrdtEngine>>,
    storage: Arc<crate::storage::DiskStorage>,
    app_handle: tauri::AppHandle,
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
    let relay_multiaddr = relay_addr();
    let relay_peer_id = relay_multiaddr.as_ref().and_then(peer_id_from_multiaddr);

    // if a relay is configured, dial it immediately
    if let Some(ref addr) = relay_multiaddr {
        log::info!("dialing relay at {}", addr);
        if let Err(e) = swarm_instance.dial(addr.clone()) {
            log::warn!("failed to dial relay: {}", e);
        }
    }

    let task = tauri::async_runtime::spawn(async move {
        use futures::StreamExt;

        // track connected peers for accurate count
        let mut connected_peers: HashSet<String> = HashSet::new();

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

        // relay reconnection state with exponential backoff
        let mut relay_backoff_secs = RELAY_INITIAL_BACKOFF_SECS;
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
                                            match engine.merge_remote_doc(&snapshot.community_id, &snapshot.doc_bytes) {
                                                Ok(()) => {
                                                    let _ = app_handle.emit("dusk-event", DuskEvent::SyncComplete {
                                                        community_id: snapshot.community_id,
                                                    });
                                                }
                                                Err(e) => {
                                                    log::warn!("failed to merge remote doc for {}: {}", snapshot.community_id, e);
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
                                        match update.status {
                                            crate::protocol::messages::PeerStatus::Online => {
                                                let _ = app_handle.emit("dusk-event", DuskEvent::PeerConnected {
                                                    peer_id: update.peer_id,
                                                });
                                            }
                                            crate::protocol::messages::PeerStatus::Offline => {
                                                let _ = app_handle.emit("dusk-event", DuskEvent::PeerDisconnected {
                                                    peer_id: update.peer_id,
                                                });
                                            }
                                            _ => {}
                                        }
                                    }
                                    crate::protocol::messages::GossipMessage::MetaUpdate(meta) => {
                                        let _ = app_handle.emit("dusk-event", DuskEvent::SyncComplete {
                                            community_id: meta.id,
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::ProfileAnnounce(profile) => {
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
                                        });
                                    }
                                    crate::protocol::messages::GossipMessage::ProfileRevoke(revocation) => {
                                        // peer is revoking their identity, remove them from our directory
                                        let _ = storage.remove_directory_entry(&revocation.peer_id);

                                        let _ = app_handle.emit("dusk-event", DuskEvent::ProfileRevoked {
                                            peer_id: revocation.peer_id,
                                        });
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

                            // sync documents with newly discovered LAN peers
                            if !peers.is_empty() {
                                let local_peer_id = *swarm_instance.local_peer_id();
                                let request = crate::crdt::sync::SyncMessage::RequestSync {
                                    peer_id: local_peer_id.to_string(),
                                };
                                if let Ok(data) = serde_json::to_vec(&request) {
                                    let sync_topic = libp2p::gossipsub::IdentTopic::new(gossip::topic_for_sync());
                                    let _ = swarm_instance.behaviour_mut().gossipsub.publish(sync_topic, data);
                                }
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

                                log::info!("discovered peer {} via rendezvous", discovered_peer);

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
                                // cancel any pending retry
                                relay_retry_at = None;

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
                        }
                        libp2p::swarm::SwarmEvent::ConnectionClosed { peer_id, num_established, .. } => {
                            if num_established == 0 {
                                connected_peers.remove(&peer_id.to_string());
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

                                    relay_retry_at = Some(
                                        tokio::time::Instant::now() + std::time::Duration::from_secs(relay_backoff_secs),
                                    );
                                    relay_backoff_secs = (relay_backoff_secs * RELAY_BACKOFF_MULTIPLIER)
                                        .min(RELAY_MAX_BACKOFF_SECS);
                                }
                            }
                        }

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
                    }
                }
            }
        }

        log::info!("p2p node event loop exited");
    });

    Ok(NodeHandle { task, command_tx })
}
