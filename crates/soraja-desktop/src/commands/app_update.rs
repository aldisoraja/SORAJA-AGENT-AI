//! Pembaruan otomatis aplikasi (`tauri-plugin-updater`). Kontrak: specs/ipc-contracts.md bagian 8.
//! Endpoint & kunci publik ada di `tauri.conf.json` → `plugins.updater`; bundle bertanda tangan `.sig` diunggah
//! `tauri-action`, lalu `latest.json` ditulis job `manifest` (`scripts/updater-manifest.mjs`) di GitHub Release terbaru.
//! Hasil `check_app_update` disimpan di state agar `install_app_update` memasang versi yang sama
//! dengan yang dilihat pengguna (tanpa memeriksa ulang ke server).

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Jarak minimal antar event progres agar UI tidak dibanjiri event per chunk.
const PROGRESS_STEP_BYTES: u64 = 256 * 1024;

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    version: String,
    current_version: String,
    notes: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Memeriksa versi terbaru. `None` = aplikasi sudah versi terbaru.
#[tauri::command]
pub async fn check_app_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<AppUpdateInfo>, String> {
    let updater = app.updater().map_err(|e| format!("Pembaru aplikasi tidak tersedia: {}", e))?;
    let update = updater.check().await.map_err(|e| format!("Gagal memeriksa pembaruan: {}", e))?;
    let info = update.as_ref().map(|u| AppUpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone().filter(|b| !b.trim().is_empty()),
    });
    *pending.0.lock().map_err(|e| e.to_string())? = update;
    Ok(info)
}

/// Mengunduh & memasang pembaruan hasil `check_app_update`, lalu memulai ulang aplikasi.
/// Windows: installer berjalan mode passive dan plugin menutup aplikasi sendiri sebelum installer jalan.
#[tauri::command]
pub async fn install_app_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Tidak ada pembaruan yang siap dipasang. Periksa pembaruan lagi.".to_string())?;

    let mut downloaded: u64 = 0;
    let mut last_emitted: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                if downloaded - last_emitted >= PROGRESS_STEP_BYTES || total == Some(downloaded) {
                    last_emitted = downloaded;
                    let _ = app.emit("app:update_progress", UpdateProgress { downloaded, total });
                }
            },
            || {},
        )
        .await
        .map_err(|e| format!("Gagal memasang pembaruan: {}", e))?;

    app.restart()
}
