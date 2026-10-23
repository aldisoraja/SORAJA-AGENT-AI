// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Host Tauri v2. Seluruh command terdaftar di sini WAJIB sesuai specs/ipc-contracts.md.

mod commands;

use commands::{
    antigravity_grants, app_update, attachments, catalog, headless, language_rules, permission_bridge, pty, session_control, skills,
    workspace,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Dialog folder native → path absolut proyek (pengganti showDirectoryPicker)
        .plugin(tauri_plugin_dialog::init())
        // Pembaruan otomatis dari GitHub Release (latest.json + tanda tangan .sig)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_update::PendingUpdate::default())
        .manage(pty::PtyState::default())
        // Jembatan izin HITL Chat GUI (MCP lokal untuk `--permission-prompt-tool` Claude)
        .manage(permission_bridge::PermissionBridge::default())
        .manage(headless::HeadlessStdins::default())
        // Proses CLI headless per sesi (Job Object Windows) untuk Stop/Jeda/Lanjut
        .manage(session_control::HeadlessProcesses::default())
        .manage(skills::SkillsState::default())
        .invoke_handler(tauri::generate_handler![
            // Mode Terminal (PTY interaktif)
            pty::start_interactive_pty,
            pty::attach_interactive_pty,
            pty::write_interactive_pty,
            pty::resize_interactive_pty,
            pty::close_interactive_pty,
            // Mode Chat GUI (CLI headless)
            headless::spawn_headless_agent,
            headless::write_headless_agent_stdin,
            session_control::stop_agent_session,
            session_control::pause_agent_session,
            session_control::resume_agent_session,
            permission_bridge::prepare_permission_bridge,
            permission_bridge::approve_human_in_the_loop,
            antigravity_grants::set_antigravity_command_grant,
            // Katalog, kredensial, HITL, skills
            catalog::get_available_cli_agents,
            catalog::get_agent_providers,
            catalog::get_agent_models,
            catalog::get_agent_token_stats,
            catalog::get_user_cli_profile,
            catalog::trust_and_prepare_workspace_for_cli,
            catalog::save_account_credential,
            skills::get_skills,
            skills::toggle_skill,
            language_rules::prepare_agent_language_rules,
            // Workspace & berkas
            workspace::get_workspaces,
            workspace::read_workspace_file,
            workspace::write_workspace_file,
            workspace::run_workspace_terminal,
            workspace::list_workspace_files,
            // Lampiran Chat GUI (gambar/dokumen → berkas yang dibaca CLI agen)
            attachments::save_chat_attachment,
            // Pembaruan aplikasi
            app_update::check_app_update,
            app_update::install_app_update,
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi Tauri");
}
