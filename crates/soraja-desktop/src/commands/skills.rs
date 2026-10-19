//! Registri skill (`soraja_core::skills`) dengan status aktif yang persisten. Kontrak: specs/ipc-contracts.md §5.
//! Satu registri per aplikasi (state Tauri); status aktif disimpan di `%APPDATA%\soraja-ai\skills.json`
//! sebagai `{ "<skill_id>": true|false }` dan dimuat ulang saat aplikasi dibuka.

use soraja_core::skills::{SkillDefinition, SkillRegistry};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct SkillsState {
    registry: Mutex<SkillRegistry>,
    path: Option<PathBuf>,
}

impl Default for SkillsState {
    fn default() -> Self {
        let path = crate::commands::language_rules::app_data_dir().map(|d| d.join("skills.json"));
        let mut registry = SkillRegistry::default();
        let saved: BTreeMap<String, bool> = path
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        for (id, enabled) in saved {
            registry.set_skill_enabled(&id, enabled);
        }
        Self { registry: Mutex::new(registry), path }
    }
}

impl SkillsState {
    fn save(&self, registry: &SkillRegistry) -> Result<(), String> {
        let Some(path) = &self.path else { return Ok(()) };
        let states: BTreeMap<&str, bool> = registry.get_all_skills().into_iter().map(|s| (s.id.as_str(), s.enabled)).collect();
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Gagal membuat {}: {}", dir.display(), e))?;
        }
        let json = serde_json::to_string_pretty(&states).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| format!("Gagal menyimpan {}: {}", path.display(), e))
    }
}

/// Status baru skill, atau error bila mengaktifkannya melewati batas token registri.
fn apply_toggle(registry: &mut SkillRegistry, skill_id: &str, enabled: bool) -> Result<bool, String> {
    let Some(skill) = registry.get_all_skills().into_iter().find(|s| s.id == skill_id).cloned() else {
        return Ok(false);
    };
    if enabled && !skill.enabled {
        let total = registry.calculate_used_tokens() + skill.token_cost;
        if total > registry.max_token_budget {
            return Err(format!(
                "Skill '{}' tidak bisa diaktifkan: total {} token melewati batas {} token.",
                skill.name, total, registry.max_token_budget
            ));
        }
    }
    Ok(registry.set_skill_enabled(skill_id, enabled))
}

#[tauri::command]
pub fn get_skills(state: State<'_, SkillsState>) -> Result<Vec<SkillDefinition>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    Ok(registry.get_all_skills().into_iter().cloned().collect())
}

#[tauri::command]
pub fn toggle_skill(state: State<'_, SkillsState>, skill_id: String, enabled: bool) -> Result<bool, String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    let found = apply_toggle(&mut registry, &skill_id, enabled)?;
    if found {
        state.save(&registry)?;
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::apply_toggle;
    use soraja_core::skills::SkillRegistry;

    #[test]
    fn skill_tidak_dikenal_mengembalikan_false() {
        let mut registry = SkillRegistry::default();
        assert_eq!(apply_toggle(&mut registry, "tidak-ada", true), Ok(false));
    }

    #[test]
    fn aktivasi_melewati_batas_token_ditolak() {
        let mut registry = SkillRegistry::default();
        registry.max_token_budget = 0;
        assert_eq!(apply_toggle(&mut registry, "generative_ui", false), Ok(true), "menonaktifkan selalu boleh");
        assert!(apply_toggle(&mut registry, "generative_ui", true).is_err());
    }
}
