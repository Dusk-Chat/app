// logs every tauri ipc command invocation and its result to the terminal
macro_rules! ipc_log {
    ($cmd:expr, $body:expr) => {{
        let start = std::time::Instant::now();
        log::info!("[ipc] -> {}", $cmd);
        let result = $body;
        let elapsed = start.elapsed();
        match &result {
            Ok(_) => log::info!("[ipc] <- {} ok ({:.1?})", $cmd, elapsed),
            Err(e) => log::error!("[ipc] <- {} err ({:.1?}): {}", $cmd, elapsed, e),
        }
        result
    }};
}

pub(crate) use ipc_log;

pub mod chat;
pub mod community;
pub mod dm;
pub mod gif;
pub mod identity;
pub mod voice;
