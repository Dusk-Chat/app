// directory protocol types for the relay-backed peer discovery service.
// the client sends DirectoryRequests to the relay and receives DirectoryResponses.

use libp2p::StreamProtocol;

pub const DIRECTORY_PROTOCOL: StreamProtocol =
    StreamProtocol::new("/dusk/directory/1.0.0");

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum DirectoryRequest {
    Register { display_name: String },
    Search { query: String },
    Remove,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum DirectoryResponse {
    Ok,
    Results(Vec<DirectoryProfileEntry>),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DirectoryProfileEntry {
    pub peer_id: String,
    pub display_name: String,
    pub last_seen: u64,
}
