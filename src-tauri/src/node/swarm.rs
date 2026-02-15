use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Duration;

use libp2p::{
    gossipsub, identify, identity, kad, mdns, noise, ping, rendezvous,
    request_response::{self, cbor, ProtocolSupport},
    tcp, yamux, Swarm, SwarmBuilder,
};

use super::behaviour::DuskBehaviour;
use crate::protocol::gif::{GifRequest, GifResponse, GIF_PROTOCOL};

pub fn build_swarm(
    keypair: &identity::Keypair,
) -> Result<Swarm<DuskBehaviour>, Box<dyn std::error::Error>> {
    // gossipsub config: content-addressed message deduplication
    let message_id_fn = |message: &gossipsub::Message| {
        let mut hasher = DefaultHasher::new();
        message.data.hash(&mut hasher);
        if let Some(ref source) = message.source {
            source.hash(&mut hasher);
        }
        gossipsub::MessageId::from(hasher.finish().to_string())
    };

    let gossipsub_config = gossipsub::ConfigBuilder::default()
        .heartbeat_interval(Duration::from_secs(1))
        .validation_mode(gossipsub::ValidationMode::Strict)
        .message_id_fn(message_id_fn)
        .mesh_n(6)
        .mesh_n_low(4)
        .mesh_n_high(12)
        .history_length(5)
        .history_gossip(3)
        .build()
        .map_err(|e| format!("invalid gossipsub config: {}", e))?;

    let swarm = SwarmBuilder::with_existing_identity(keypair.clone())
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )?
        // resolve dns4/dns6 multiaddrs (needed for relay.duskchat.app)
        .with_dns()?
        // add relay client transport so we can connect through relay circuits
        .with_relay_client(noise::Config::new, yamux::Config::default)?
        .with_behaviour(|key, relay_client| {
            let peer_id = key.public().to_peer_id();

            let gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossipsub_config,
            )
            .expect("valid gossipsub behaviour");

            let kademlia = kad::Behaviour::new(peer_id, kad::store::MemoryStore::new(peer_id));

            let mdns = mdns::tokio::Behaviour::new(mdns::Config::default(), peer_id)
                .expect("valid mdns behaviour");

            let identify = identify::Behaviour::new(identify::Config::new(
                "/dusk/1.0.0".to_string(),
                key.public(),
            ));

            let rendezvous = rendezvous::client::Behaviour::new(key.clone());

            DuskBehaviour {
                relay_client,
                rendezvous,
                gossipsub,
                kademlia,
                mdns,
                identify,
                // ping every 30s to keep the relay connection alive
                ping: ping::Behaviour::new(ping::Config::new().with_interval(Duration::from_secs(30))),
                // gif search via request-response to the relay (outbound only)
                gif_service: cbor::Behaviour::<GifRequest, GifResponse>::new(
                    [(GIF_PROTOCOL, ProtocolSupport::Outbound)],
                    request_response::Config::default()
                        .with_request_timeout(Duration::from_secs(15)),
                ),
            }
        })?
        .with_swarm_config(|cfg| cfg.with_idle_connection_timeout(Duration::from_secs(300)))
        .build();

    Ok(swarm)
}
