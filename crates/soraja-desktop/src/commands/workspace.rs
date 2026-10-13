//! Workspace, berkas & terminal satu-kali. Kontrak: specs/ipc-contracts.md §4.

use soraja_core::models::Workspace;

#[tauri::command]
pub fn get_workspaces() -> Result<Vec<Workspace>, String> {
    // TODO(spec ipc §7): baca dari tabel `workspaces` setelah db.rs tersambung ke aplikasi.
    // Daftar proyek saat ini dikelola frontend (desktop-ui/src/services/db.ts).
    Ok(Vec::new())
}

#[tauri::command]
pub fn read_workspace_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Gagal membaca file '{}': {}", path, e))
}

#[tauri::command]
pub fn write_workspace_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, content).map_err(|e| format!("Gagal menulis file '{}': {}", path, e))
}

#[tauri::command]
pub async fn run_workspace_terminal(workspace_path: String, command: String) -> Result<String, String> {
    if soraja_core::mcp_tools::TerminalExecutor::is_destructive_command(&command) {
        return Err(format!("Perintah terdeteksi berbahaya oleh guardrail: {}", command));
    }
    let executor = soraja_core::mcp_tools::TerminalExecutor::new(&workspace_path);
    executor.run_command(&command).await.map_err(|e| e.to_string())
}

fn scan_dir(dir: &std::path::Path, base: &std::path::Path, files: &mut Vec<String>, depth: usize) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy();
        if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" || file_name == "dist" {
            continue;
        }
        if path.is_dir() {
            scan_dir(&path, base, files, depth + 1);
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(base) {
                files.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

#[tauri::command]
pub fn list_workspace_files(base_path: String) -> Result<Vec<String>, String> {
    let base = std::path::Path::new(&base_path);
    let mut files = Vec::new();
    scan_dir(base, base, &mut files, 0);
    files.sort();
    Ok(files)
}
