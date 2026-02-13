use serde::{Deserialize, Serialize};

// a full document snapshot sent over gossipsub for initial sync
// when a new peer discovers us, we broadcast our documents so they can merge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentSnapshot {
    pub community_id: String,
    // raw automerge bytes, base64 encoded for json transport
    pub doc_bytes: Vec<u8>,
}

// envelope for sync-related gossipsub messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncMessage {
    // request all documents from peers (sent when a new peer joins)
    RequestSync { peer_id: String },
    // response containing a full document snapshot
    DocumentOffer(DocumentSnapshot),
}
