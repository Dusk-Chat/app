use libp2p::{gossipsub, identify, kad, mdns, ping, relay, rendezvous, swarm::NetworkBehaviour};

#[derive(NetworkBehaviour)]
pub struct DuskBehaviour {
    pub relay_client: relay::client::Behaviour,
    pub rendezvous: rendezvous::client::Behaviour,
    pub gossipsub: gossipsub::Behaviour,
    pub kademlia: kad::Behaviour<kad::store::MemoryStore>,
    pub mdns: mdns::tokio::Behaviour,
    pub identify: identify::Behaviour,
    pub ping: ping::Behaviour,
}
