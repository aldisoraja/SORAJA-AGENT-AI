//! Aturan bahasa jawaban agen (Bahasa Indonesia). Kontrak: specs/agent-protocols.md §5.
//!
//! - Menulis berkas aturan bersama di `%APPDATA%\soraja-ai\rules\bahasa-indonesia.md`
//!   (dipakai OpenCode via `OPENCODE_CONFIG_CONTENT.instructions`).
//! - Antigravity tidak punya flag system prompt, jadi blok aturan bertanda ditambahkan ke
//!   `~/.gemini/antigravity-cli/instructions.md` bila belum ada aturan Bahasa Indonesia, dan
//!   diperbarui bila `LANGUAGE_RULE` berubah.

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
    match antigravity_instructions_update(&existing) {
        Some(updated) => std::fs::write(&path, updated).map_err(|e| format!("Gagal menulis {}: {}", path.display(), e)),
        None => Ok(()),
    }
}

/// Isi baru `instructions.md` Antigravity, atau `None` bila tidak perlu ditulis ulang.
/// Blok bertanda milik Soraja diperbarui bila teks aturannya berubah; aturan Bahasa Indonesia
/// buatan pengguna sendiri (tanpa penanda) dibiarkan apa adanya.
fn antigravity_instructions_update(existing: &str) -> Option<String> {
    const HEADING: &str = "## Aturan Bahasa (ditambahkan oleh Soraja AI)";
    if let Some(start) = existing.find(AGY_MARKER) {
        // Blok = baris penanda, baris judul, lalu satu baris aturan.
        let block_end = existing[start..]
            .match_indices('\n')
            .nth(2)
            .map(|(i, _)| start + i + 1)
            .unwrap_or(existing.len());
        let block = format!("{}\n{}\n{}\n", AGY_MARKER, HEADING, LANGUAGE_RULE);
        if existing[start..block_end] == block {
            return None;
        }
        return Some(format!("{}{}{}", &existing[..start], block, &existing[block_end..]));
    }
    if existing.contains("Bahasa Indonesia") {
        return None;
    }
    let separator = if existing.is_empty() || existing.ends_with('\n') { "" } else { "\n" };
    Some(format!("{}{}\n{}\n{}\n{}\n", existing, separator, AGY_MARKER, HEADING, LANGUAGE_RULE))
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

#[cfg(test)]
mod tests {
    use super::{antigravity_instructions_update, AGY_MARKER, LANGUAGE_RULE};

    #[test]
    fn blok_lama_diperbarui_tanpa_menyentuh_isi_lain() {
        let lama = format!("Catatan pengguna\n\n{}\n## Aturan Bahasa (ditambahkan oleh Soraja AI)\nAturan lama.\nPenutup\n", AGY_MARKER);
        let baru = antigravity_instructions_update(&lama).expect("harus ditulis ulang");
        assert!(baru.starts_with("Catatan pengguna\n\n"));
        assert!(baru.contains(LANGUAGE_RULE) && !baru.contains("Aturan lama."));
        assert!(baru.ends_with("Penutup\n"));
        assert_eq!(antigravity_instructions_update(&baru), None, "blok terbaru tidak ditulis ulang");
    }

    #[test]
    fn berkas_tanpa_aturan_mendapat_blok_baru() {
        let baru = antigravity_instructions_update("Catatan").unwrap();
        assert!(baru.starts_with("Catatan\n\n") && baru.contains(AGY_MARKER) && baru.contains(LANGUAGE_RULE));
    }

    #[test]
    fn aturan_buatan_pengguna_dibiarkan() {
        assert_eq!(antigravity_instructions_update("Jawab dalam Bahasa Indonesia."), None);
    }
}
