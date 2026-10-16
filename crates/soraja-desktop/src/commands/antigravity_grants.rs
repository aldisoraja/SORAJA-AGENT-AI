//! Izin perintah persis untuk Antigravity headless (HITL Chat GUI, specs/agent-protocols.md §7).
//!
//! `agy -p` tidak bisa bertanya izin: perintah shell yang belum diizinkan langsung ditolak. Setelah pengguna
//! menyetujui perintah itu di modal HITL, Soraja menambahkan aturan `command(<perintah persis>)` ke
//! `permissions.allow` di `~/.gemini/antigravity-cli/settings.json` selama giliran lanjutan, lalu mencabutnya.
//! Hanya bentuk persis yang dipatuhi agy 1.4 (`command(node)` / `command(node -e)` tetap ditolak; diuji 16 Okt 2026).

use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

/// Aturan yang ditambahkan Soraja (aturan milik pengguna tidak pernah dicabut).
static GRANTED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn settings_path() -> Result<PathBuf, String> {
    crate::commands::language_rules::user_home()
        .map(|h| h.join(".gemini").join("antigravity-cli").join("settings.json"))
        .ok_or_else(|| "Folder home pengguna tidak ditemukan".to_string())
}

fn rule_for(command: &str) -> String {
    format!("command({})", command.trim())
}

/// Mengubah daftar `permissions.allow`; mengembalikan `true` bila berkas berubah.
fn update_allow(settings: &mut Value, rule: &str, granted: bool) -> bool {
    if !settings.is_object() {
        *settings = json!({});
    }
    let permissions = settings
        .as_object_mut()
        .unwrap()
        .entry("permissions")
        .or_insert_with(|| json!({}));
    if !permissions.is_object() {
        *permissions = json!({});
    }
    let allow = permissions
        .as_object_mut()
        .unwrap()
        .entry("allow")
        .or_insert_with(|| json!([]));
    let Some(list) = allow.as_array_mut() else {
        return false;
    };
    let exists = list.iter().any(|v| v.as_str() == Some(rule));
    if granted && !exists {
        list.push(Value::String(rule.to_string()));
        true
    } else if !granted && exists {
        list.retain(|v| v.as_str() != Some(rule));
        true
    } else {
        false
    }
}

/// `granted = true` menambahkan `command(<command>)`; `false` mencabut aturan yang sebelumnya ditambahkan Soraja.
#[tauri::command]
pub fn set_antigravity_command_grant(command: String, granted: bool) -> Result<(), String> {
    let rule = rule_for(&command);
    if command.trim().is_empty() {
        return Err("Perintah kosong".into());
    }
    let mut owned = GRANTED.lock().map_err(|e| e.to_string())?;
    let owned = owned.get_or_insert_with(HashSet::new);
    if !granted && !owned.contains(&rule) {
        return Ok(());
    }
    let path = settings_path()?;
    let mut settings: Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| json!({}));
    let already_allowed = settings["permissions"]["allow"]
        .as_array()
        .is_some_and(|list| list.iter().any(|v| v.as_str() == Some(rule.as_str())));
    if granted && already_allowed {
        return Ok(());
    }
    if update_allow(&mut settings, &rule, granted) {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Gagal membuat {}: {e}", dir.display()))?;
        }
        let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        std::fs::write(&path, text).map_err(|e| format!("Gagal menulis {}: {e}", path.display()))?;
    }
    if granted {
        owned.insert(rule);
    } else {
        owned.remove(&rule);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tambah_dan_cabut_aturan_tanpa_mengusik_isi_lain() {
        let mut s = json!({ "model": "x", "permissions": { "allow": ["command(git status)"], "deny": [] } });
        assert!(update_allow(&mut s, "command(node -e \"1\")", true));
        assert!(!update_allow(&mut s, "command(node -e \"1\")", true), "tidak dobel");
        assert_eq!(s["permissions"]["allow"], json!(["command(git status)", "command(node -e \"1\")"]));
        assert!(update_allow(&mut s, "command(node -e \"1\")", false));
        assert_eq!(s, json!({ "model": "x", "permissions": { "allow": ["command(git status)"], "deny": [] } }));

        let mut empty = json!({ "trustedWorkspaces": [] });
        assert!(update_allow(&mut empty, "command(ls)", true));
        assert_eq!(empty["permissions"]["allow"], json!(["command(ls)"]));
        assert_eq!(rule_for("  npm test "), "command(npm test)");
    }
}
