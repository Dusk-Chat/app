// prevents additional console window on windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dusk_chat_lib::run()
}
