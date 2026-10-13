//! Lampiran Chat GUI (gambar/dokumen) disimpan ke `<proyek>/.soraja/attachments/<pesan>/` agar
//! keempat CLI agen bisa membacanya dengan tool baca berkas miliknya sendiri.
//! Kontrak: specs/ipc-contracts.md §4, alur: specs/agent-protocols.md §2.

use base64::Engine;
use std::path::{Path, PathBuf};

/// Batas ukuran satu lampiran (setelah decode) agar memori & disk tetap aman.
const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

/// Hanya huruf, angka, `.`, `-`, `_` — mencegah path traversal (`..`, `\`, `/`, `:`).
fn sanitize_segment(raw: &str, fallback: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let trimmed = cleaned.trim_matches('.').to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(120).collect()
    }
}

/// Folder `.soraja` diabaikan git (berisi `.gitignore` = `*`) agar lampiran tidak ikut ter-commit.
fn ensure_soraja_dir(project: &Path) -> Result<PathBuf, String> {
    let dir = project.join(".soraja");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Gagal membuat folder .soraja: {}", e))?;
    let ignore = dir.join(".gitignore");
    if !ignore.exists() {
        let _ = std::fs::write(&ignore, "*\n");
    }
    Ok(dir)
}

#[tauri::command]
pub fn save_chat_attachment(
    project_path: String,
    message_id: String,
    file_name: String,
    data_base64: String,
) -> Result<String, String> {
    let project = Path::new(&project_path);
    if !project.is_dir() {
        return Err(format!("Folder proyek tidak ditemukan: {}", project_path));
    }
    // Terima data URL (`data:image/png;base64,...`) maupun base64 murni.
    let payload = data_base64.split_once(",").map(|(_, b)| b).unwrap_or(&data_base64);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .map_err(|e| format!("Data lampiran tidak valid: {}", e))?;
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!("Lampiran {} melebihi batas 25 MB", file_name));
    }

    let dir = ensure_soraja_dir(project)?
        .join("attachments")
        .join(sanitize_segment(&message_id, "pesan"));
    std::fs::create_dir_all(&dir).map_err(|e| format!("Gagal membuat folder lampiran: {}", e))?;
    let target = dir.join(sanitize_segment(&file_name, "lampiran.bin"));
    std::fs::write(&target, bytes).map_err(|e| format!("Gagal menyimpan lampiran: {}", e))?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::sanitize_segment;

    #[test]
    fn sanitize_blocks_traversal() {
        assert_eq!(sanitize_segment("../../etc/passwd", "x"), "_.._etc_passwd");
        assert_eq!(sanitize_segment("..", "x"), "x");
        assert_eq!(sanitize_segment("C:\\win.png", "x"), "C__win.png");
        assert_eq!(sanitize_segment("01-screenshot.png", "x"), "01-screenshot.png");
    }
}
