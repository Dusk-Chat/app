use crate::protocol::directory::{DirectoryRequest, DirectoryResponse};
use crate::protocol::gif::{GifRequest, GifResponse};
use libp2p::{
    gossipsub, identify, kad, mdns, ping, relay, rendezvous, request_response::cbor,
    swarm::NetworkBehaviour,
};

#[derive(NetworkBehaviour)]
pub struct DuskBehaviour {
    pub relay_client: relay::client::Behaviour,
    pub rendezvous: rendezvous::client::Behaviour,
    pub gossipsub: gossipsub::Behaviour,
    pub kademlia: kad::Behaviour<kad::store::MemoryStore>,
    pub mdns: mdns::tokio::Behaviour,
    pub identify: identify::Behaviour,
    pub ping: ping::Behaviour,
    // gif search: sends requests to the relay, receives responses
    pub gif_service: cbor::Behaviour<GifRequest, GifResponse>,
    // directory search: register/search/remove profiles on the relay
    pub directory_service: cbor::Behaviour<DirectoryRequest, DirectoryResponse>,
}
