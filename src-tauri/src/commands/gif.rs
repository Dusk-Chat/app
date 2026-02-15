use tauri::State;

use crate::node::NodeCommand;
use crate::protocol::gif::{GifRequest, GifResponse};
use crate::AppState;

#[tauri::command]
pub async fn search_gifs(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<GifResponse, String> {
    let handle_ref = state.node_handle.lock().await;
    let handle = handle_ref.as_ref().ok_or("node not running")?;

    let (tx, rx) = tokio::sync::oneshot::channel();

    handle
        .command_tx
        .send(NodeCommand::GifSearch {
            request: GifRequest {
                kind: "search".to_string(),
                query,
                limit: limit.unwrap_or(20),
            },
            reply: tx,
        })
        .await
        .map_err(|_| "failed to send gif search command".to_string())?;

    // drop the lock before awaiting the response
    drop(handle_ref);

    rx.await.map_err(|_| "gif search response channel closed".to_string())?
}

#[tauri::command]
pub async fn get_trending_gifs(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<GifResponse, String> {
    let handle_ref = state.node_handle.lock().await;
    let handle = handle_ref.as_ref().ok_or("node not running")?;

    let (tx, rx) = tokio::sync::oneshot::channel();

    handle
        .command_tx
        .send(NodeCommand::GifSearch {
            request: GifRequest {
                kind: "trending".to_string(),
                query: String::new(),
                limit: limit.unwrap_or(20),
            },
            reply: tx,
        })
        .await
        .map_err(|_| "failed to send trending gifs command".to_string())?;

    drop(handle_ref);

    rx.await.map_err(|_| "trending gifs response channel closed".to_string())?
}
