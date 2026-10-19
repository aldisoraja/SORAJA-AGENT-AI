//! Aturan bahasa jawaban agen (Bahasa Indonesia). Kontrak: specs/agent-protocols.md §5.
//!
//! - Menulis berkas aturan bersama di `%APPDATA%\soraja-ai\rules\bahasa-indonesia.md`
//!   (dipakai OpenCode via `OPENCODE_CONFIG_CONTENT.instructions`).
//! - Antigravity tidak punya flag system prompt, jadi blok aturan bertanda ditambahkan SEKALI
//!   ke `~/.gemini/antigravity-cli/instructions.md` bila belum ada aturan Bahasa Indonesia.

use std::path::PathBuf;

pub const LANGUAGE_RULE: &str = "Selalu jawab, jelaskan, dan rangkum dalam Bahasa Indonesia yang jelas dan ramah. Istilah teknis (function, hook, endpoint, dll.) boleh tetap dalam bahasa aslinya. Jangan gunakan simbol § saat merujuk bagian dokumen; tulis bagian N (misalnya bagian 7).";
const AGY_MARKER: &str = "<!-- soraja:bahasa-indonesia -->";

pub fn user_home() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(PathBuf::from)
}

fn app_data_dir() -> Option<PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .map(PathBuf::from)
        .or_else(|| user_home().map(|h| h.join(".config")))
        .map(|d| d.join("soraja-ai"))
}

fn ensure_rules_file() -> Result<PathBuf, String> {
    let dir = app_data_dir()
        .ok_or("Direktori APPDATA tidak ditemukan")?
        .join("rules");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Gagal membuat {}: {}", dir.display(), e))?;
    let path = dir.join("bahasa-indonesia.md");
    let content = format!("# Aturan Bahasa (Soraja AI)\n\n{}\n", LANGUAGE_RULE);
    if std::fs::read_to_string(&path).ok().as_deref() != Some(content.as_str()) {
        std::fs::write(&path, content).map_err(|e| format!("Gagal menulis {}: {}", path.display(), e))?;
    }
    Ok(path)
}

fn ensure_antigravity_global_rule() -> Result<(), String> {
    let Some(dir) = user_home().map(|h| h.join(".gemini").join("antigravity-cli")) else {
        return Ok(());
    };
    if !dir.exists() {
        return Ok(()); // agy belum pernah dijalankan; jangan buat struktur config asing
    }
    let path = dir.join("instructions.md");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    if existing.contains(AGY_MARKER) || existing.contains("Bahasa Indonesia") {
        return Ok(());
    }
    let separator = if existing.is_empty() || existing.ends_with('\n') { "" } else { "\n" };
    let block = format!("{}\n{}\n## Aturan Bahasa (ditambahkan oleh Soraja AI)\n{}\n", separator, AGY_MARKER, LANGUAGE_RULE);
    std::fs::write(&path, existing + &block).map_err(|e| format!("Gagal menulis {}: {}", path.display(), e))
}

/// Menyiapkan aturan bahasa untuk agen tertentu dan mengembalikan path berkas aturan bersama.
#[tauri::command]
pub fn prepare_agent_language_rules(agent_id: String) -> Result<String, String> {
    let rules_path = ensure_rules_file()?;
    if agent_id == "antigravity" || agent_id == "agy" {
        ensure_antigravity_global_rule()?;
    }
    Ok(rules_path.to_string_lossy().replace('\\', "/"))
}
