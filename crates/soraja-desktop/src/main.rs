// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Host Tauri v2. Seluruh command terdaftar di sini WAJIB sesuai specs/ipc-contracts.md.

mod commands;

use commands::{attachments, catalog, headless, language_rules, pty, workspace};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Dialog folder native → path absolut proyek (pengganti showDirectoryPicker)
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            // Mode Terminal (PTY interaktif)
            pty::start_interactive_pty,
            pty::write_interactive_pty,
            pty::resize_interactive_pty,
            pty::close_interactive_pty,
            // Mode Chat GUI (CLI headless)
            headless::spawn_headless_agent,
            headless::stop_agent_session,
            headless::pause_agent_session,
            headless::resume_agent_session,
            // Katalog, kredensial, HITL, skills
            catalog::get_available_cli_agents,
            catalog::get_agent_providers,
            catalog::get_agent_models,
            catalog::get_agent_token_stats,
            catalog::get_user_cli_profile,
            catalog::trust_and_prepare_workspace_for_cli,
            catalog::save_account_credential,
            catalog::approve_human_in_the_loop,
            catalog::get_skills,
            catalog::toggle_skill,
            language_rules::prepare_agent_language_rules,
            // Workspace & berkas
            workspace::get_workspaces,
            workspace::read_workspace_file,
            workspace::write_workspace_file,
            workspace::run_workspace_terminal,
            workspace::list_workspace_files,
            // Lampiran Chat GUI (gambar/dokumen → berkas yang dibaca CLI agen)
            attachments::save_chat_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi Tauri");
}
