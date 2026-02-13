mod commands;
mod crdt;
mod node;
mod protocol;
mod storage;

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::crdt::CrdtEngine;
use crate::protocol::identity::DuskIdentity;
use crate::storage::DiskStorage;

// shared application state accessible from all tauri commands
pub struct AppState {
    pub identity: Arc<Mutex<Option<DuskIdentity>>>,
    pub crdt_engine: Arc<Mutex<CrdtEngine>>,
    pub storage: Arc<DiskStorage>,
    pub node_handle: Arc<Mutex<Option<node::NodeHandle>>>,
}

impl AppState {
    pub fn new() -> Self {
        let storage = Arc::new(DiskStorage::new().expect("failed to initialize storage"));
        let mut engine = CrdtEngine::new(storage.clone());

        // restore persisted communities from disk so data survives restarts
        if let Err(e) = engine.load_all() {
            log::warn!("failed to load persisted communities: {}", e);
        }

        let crdt_engine = Arc::new(Mutex::new(engine));

        Self {
            identity: Arc::new(Mutex::new(None)),
            crdt_engine,
            storage,
            node_handle: Arc::new(Mutex::new(None)),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // load .env from the project root so config like DUSK_RELAY_ADDR is available
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::identity::has_identity,
            commands::identity::load_identity,
            commands::identity::create_identity,
            commands::identity::update_display_name,
            commands::identity::update_profile,
            commands::identity::load_settings,
            commands::identity::save_settings,
            commands::identity::get_known_peers,
            commands::identity::search_directory,
            commands::identity::get_friends,
            commands::identity::add_friend,
            commands::identity::remove_friend,
            commands::identity::reset_identity,
            commands::chat::send_message,
            commands::chat::get_messages,
            commands::chat::send_typing,
            commands::chat::start_node,
            commands::chat::stop_node,
            commands::community::create_community,
            commands::community::join_community,
            commands::community::leave_community,
            commands::community::get_communities,
            commands::community::create_channel,
            commands::community::get_channels,
            commands::community::get_members,
            commands::community::delete_message,
            commands::community::kick_member,
            commands::community::generate_invite,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dusk");
}
