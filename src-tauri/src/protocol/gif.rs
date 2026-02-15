// gif protocol types shared between the tauri client and the relay server.
// the client sends a GifRequest over libp2p request-response and the relay
// responds with a GifResponse after fetching from klipy.

use libp2p::StreamProtocol;

pub const GIF_PROTOCOL: StreamProtocol = StreamProtocol::new("/dusk/gif/1.0.0");

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GifRequest {
    // "search" or "trending"
    pub kind: String,
    // search query (only used when kind == "search")
    pub query: String,
    pub limit: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GifResponse {
    pub results: Vec<GifResult>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GifResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub preview: String,
    pub dims: [u32; 2],
}
