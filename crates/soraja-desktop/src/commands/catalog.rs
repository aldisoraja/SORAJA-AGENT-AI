//! Katalog & deteksi agen CLI, kredensial, HITL, skills. Kontrak: specs/ipc-contracts.md §2-§5.

use soraja_core::agent_catalog::{self, CliAgentProvider, CliModelItem, UserCliProfile};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CliAgentStatus {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub is_installed: bool,
    pub path: Option<String>,
    pub vendor: String,
    pub description: String,
}

/// Menjalankan kerja yang memblokir (menjalankan CLI, membaca berkas) di blocking pool Tokio.
/// Command Tauri sinkron berjalan di main thread dan akan membekukan UI selama CLI berjalan.
async fn run_blocking<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tokio::task::spawn_blocking(job)
        .await
        .map_err(|e| format!("Tugas latar belakang gagal: {e}"))
}

#[tauri::command]
pub async fn get_agent_providers() -> Result<Vec<CliAgentProvider>, String> {
    run_blocking(agent_catalog::get_authoritative_agent_providers).await
}

#[tauri::command]
pub async fn get_agent_models(agent_id: String) -> Result<Vec<CliModelItem>, String> {
    run_blocking(move || agent_catalog::get_agent_models(&agent_id)).await
}

#[tauri::command]
pub async fn get_available_cli_agents() -> Result<Vec<CliAgentStatus>, String> {
    // Hanya deteksi biner (tanpa menjalankan CLI): dipanggil saat membuka wizard & saat startup.
    let providers = run_blocking(agent_catalog::get_agent_install_status).await?;
    Ok(providers
        .into_iter()
        .map(|p| CliAgentStatus {
            id: p.id,
            name: p.name,
            executable: p.executable,
            is_installed: p.is_installed,
            path: p.binary_path,
            vendor: p.vendor,
            description: p.description,
        })
        .collect())
}

#[tauri::command]
pub async fn get_agent_token_stats(agent_id: String) -> Result<soraja_core::token_tracker::AgentTokenStats, String> {
    run_blocking(move || soraja_core::token_tracker::get_live_agent_token_stats(&agent_id)).await
}

#[tauri::command]
pub async fn get_user_cli_profile(agent_id: String) -> Result<UserCliProfile, String> {
    run_blocking(move || agent_catalog::get_user_cli_profile(&agent_id)).await
}

/// Mendaftarkan folder ke `trustedWorkspaces` Antigravity CLI agar `agy` tidak memblokir saat start.
#[tauri::command]
pub async fn trust_and_prepare_workspace_for_cli(workspace_path: String, agent_id: String) -> Result<String, String> {
    run_blocking(move || trust_workspace_blocking(workspace_path, agent_id)).await?
}

fn trust_workspace_blocking(workspace_path: String, agent_id: String) -> Result<String, String> {
    if agent_id == "antigravity" || agent_id == "agy" {
        if let Some(settings_path) = crate::commands::language_rules::user_home()
            .map(|h| h.join(".gemini").join("antigravity-cli").join("settings.json"))
        {
            if let Ok(content) = std::fs::read_to_string(&settings_path) {
                if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(arr) = json.get_mut("trustedWorkspaces").and_then(|v| v.as_array_mut()) {
                        let clean_ws = workspace_path.replace('/', "\\");
                        let exists = arr.iter().any(|v| {
                            v.as_str()
                                .map(|s| s.eq_ignore_ascii_case(&clean_ws) || s.eq_ignore_ascii_case(&workspace_path))
                                .unwrap_or(false)
                        });
                        if !exists {
                            arr.push(serde_json::Value::String(clean_ws));
                            if let Ok(serialized) = serde_json::to_string_pretty(&json) {
                                let _ = std::fs::write(&settings_path, serialized);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(format!("Workspace '{}' siap dan terpercaya untuk mesin CLI {}", workspace_path, agent_id))
}

#[tauri::command]
pub fn save_account_credential(provider: String, secret_token: String) -> Result<(), String> {
    soraja_core::auth::save_token(&provider, &secret_token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn approve_human_in_the_loop(session_id: String, tool_call_id: String, approved: bool) -> Result<(), String> {
    // TODO(spec agent-protocols §7): teruskan ke permission-prompt-tool MCP.
    println!("Persetujuan HITL untuk sesi {} tool {}: {}", session_id, tool_call_id, approved);
    Ok(())
}

#[tauri::command]
pub fn get_skills() -> Result<Vec<soraja_core::skills::SkillDefinition>, String> {
    let registry = soraja_core::skills::SkillRegistry::default();
    Ok(registry.get_all_skills().into_iter().cloned().collect())
}

#[tauri::command]
pub fn toggle_skill(skill_id: String, enabled: bool) -> Result<bool, String> {
    let mut registry = soraja_core::skills::SkillRegistry::default();
    Ok(registry.set_skill_enabled(&skill_id, enabled))
}
