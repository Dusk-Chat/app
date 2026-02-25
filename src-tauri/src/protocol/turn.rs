// turn credential protocol types for requesting time-limited TURN server
// credentials from the relay. the client sends a TurnCredentialRequest
// and receives a TurnCredentialResponse with HMAC-based credentials.

use libp2p::StreamProtocol;

pub const TURN_CREDENTIALS_PROTOCOL: StreamProtocol =
    StreamProtocol::new("/dusk/turn-credentials/1.0.0");

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TurnCredentialRequest {
    pub peer_id: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TurnCredentialResponse {
    pub username: String,
    pub password: String,
    pub ttl: u64,
    pub uris: Vec<String>,
}
