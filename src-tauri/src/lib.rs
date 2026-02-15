mod commands;
mod crdt;
#[cfg(feature = "dev-server")]
mod dev_server;
mod node;
mod protocol;
mod storage;
mod verification;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::crdt::CrdtEngine;
use crate::protocol::identity::DuskIdentity;
use crate::protocol::messages::VoiceParticipant;
use crate::storage::DiskStorage;

// shared application state accessible from all tauri commands
pub struct AppState {
    pub identity: Arc<Mutex<Option<DuskIdentity>>>,
    pub crdt_engine: Arc<Mutex<CrdtEngine>>,
    pub storage: Arc<DiskStorage>,
    pub node_handle: Arc<Mutex<Option<node::NodeHandle>>>,
    // tracks which peers are in which voice channels, keyed by "community_id:channel_id"
    pub voice_channels: Arc<Mutex<HashMap<String, Vec<VoiceParticipant>>>>,
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
            voice_channels: Arc::new(Mutex::new(HashMap::new())),
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
        .setup(|app| {
            // grant microphone/camera permissions on linux webkitgtk
            // without this, getUserMedia is denied by default
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window
                        .with_webview(|webview| {
                            use webkit2gtk::PermissionRequestExt;
                            use webkit2gtk::WebViewExt;
                            let wv = webview.inner();
                            wv.connect_permission_request(|_webview, request| {
                                request.allow();
                                true
                            });
                        })
                        .ok();
                }
            }
            // launch the dev http server when compiled with the dev-server feature
            // available at http://127.0.0.1:3333 (or DUSK_DEV_PORT)
            #[cfg(feature = "dev-server")]
            {
                use tauri::Manager;
                let state = app.state::<AppState>();
                let dev_state = dev_server::DevState {
                    identity: std::sync::Arc::clone(&state.identity),
                    crdt_engine: std::sync::Arc::clone(&state.crdt_engine),
                    storage: std::sync::Arc::clone(&state.storage),
                    node_handle: std::sync::Arc::clone(&state.node_handle),
                    voice_channels: std::sync::Arc::clone(&state.voice_channels),
                    app_handle: app.handle().clone(),
                };
                tauri::async_runtime::spawn(dev_server::start(dev_state));
            }

            Ok(())
        })
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
            commands::identity::discover_global_peers,
            commands::identity::set_relay_address,
            commands::identity::reset_identity,
            commands::chat::send_message,
            commands::chat::get_messages,
            commands::chat::send_typing,
            commands::chat::start_node,
            commands::chat::stop_node,
            commands::chat::check_internet_connectivity,
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
            commands::community::reorder_channels,
            commands::community::create_category,
            commands::community::get_categories,
            commands::voice::join_voice_channel,
            commands::voice::leave_voice_channel,
            commands::voice::update_voice_media_state,
            commands::voice::send_voice_sdp,
            commands::voice::send_voice_ice_candidate,
            commands::voice::get_voice_participants,
            commands::dm::send_dm,
            commands::dm::get_dm_messages,
            commands::dm::get_dm_conversations,
            commands::dm::mark_dm_read,
            commands::dm::delete_dm_conversation,
            commands::dm::send_dm_typing,
            commands::dm::open_dm_conversation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dusk");
}
