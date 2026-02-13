// peer discovery helpers for mdns and kademlia
// the actual discovery handling is in the node event loop (mod.rs)
// this module provides utility functions for discovery-related operations

use libp2p::Multiaddr;

// format a peer address for display
#[allow(dead_code)]
pub fn format_peer_addr(addr: &Multiaddr) -> String {
    addr.to_string()
}
