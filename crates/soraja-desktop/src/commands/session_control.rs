//! Kontrol proses CLI headless Chat GUI (Stop / Jeda / Lanjut) berdasarkan `session_id`.
//! Kontrak: specs/ipc-contracts.md §2. Di Windows setiap proses diikat ke Job Object (`process_job.rs`),
//! sehingga Stop dan Jeda berlaku untuk seluruh pohon proses CLI, bukan hanya proses induknya.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

struct SessionProcess {
    pid: u32,
    #[cfg(windows)]
    job: Option<super::process_job::ProcessJob>,
}

/// Proses CLI headless yang sedang berjalan, per `session_id`.
#[derive(Default)]
pub struct HeadlessProcesses {
    sessions: Mutex<HashMap<String, SessionProcess>>,
}

impl HeadlessProcesses {
    /// Mendaftarkan proses CLI sesi (dipanggil tepat setelah spawn).
    pub fn register(&self, session_id: &str, child: &tokio::process::Child) {
        let pid = child.id().unwrap_or(0);
        #[cfg(windows)]
        let job = child.raw_handle().and_then(|handle| {
            super::process_job::ProcessJob::attach(handle)
                .map_err(|e| eprintln!("[soraja] Job Object sesi {session_id} gagal dibuat: {e}"))
                .ok()
        });
        let process = SessionProcess {
            pid,
            #[cfg(windows)]
            job,
        };
        if let Ok(mut map) = self.sessions.lock() {
            map.insert(session_id.to_string(), process);
        }
    }

    /// PID proses sesi yang masih berjalan.
    pub fn pid_of(&self, session_id: &str) -> Option<u32> {
        self.sessions.lock().ok()?.get(session_id).map(|p| p.pid)
    }

    /// CLI selesai sendiri: hapus sesi tanpa mematikan proses latar yang ditinggal agen.
    /// Hanya bila `pid` masih pemilik sesi (sesi dengan id sama bisa sudah dijalankan ulang).
    pub fn release(&self, session_id: &str, pid: u32) {
        let Ok(mut map) = self.sessions.lock() else { return };
        if map.get(session_id).map(|p| p.pid) != Some(pid) {
            return;
        }
        let removed = map.remove(session_id);
        #[cfg(windows)]
        if let Some(job) = removed.and_then(|p| p.job) {
            job.release();
        }
        #[cfg(not(windows))]
        drop(removed);
    }

    /// Hard stop seluruh pohon proses sesi. Sesi yang sudah berakhir dianggap berhasil.
    /// `pid = Some(..)` hanya menghentikan bila proses itu masih pemilik sesi.
    pub fn stop(&self, session_id: &str, pid: Option<u32>) -> Result<(), String> {
        let process = {
            let mut map = self.sessions.lock().map_err(|e| e.to_string())?;
            if pid.is_some() && map.get(session_id).map(|p| p.pid) != pid {
                return Ok(());
            }
            map.remove(session_id)
        };
        let Some(process) = process else { return Ok(()) };
        #[cfg(windows)]
        if let Some(job) = &process.job {
            if job.terminate().is_ok() {
                return Ok(());
            }
        }
        kill_tree(process.pid)
    }

    /// Menjeda (`true`) / melanjutkan (`false`) seluruh proses sesi.
    pub fn set_paused(&self, session_id: &str, paused: bool) -> Result<(), String> {
        let map = self.sessions.lock().map_err(|e| e.to_string())?;
        let process = map
            .get(session_id)
            .ok_or_else(|| format!("Sesi agen {session_id} sudah tidak berjalan."))?;
        #[cfg(windows)]
        let ok = process.job.as_ref().is_some_and(|job| job.set_suspended(paused) > 0)
            || super::process_job::set_process_suspended(process.pid, paused);
        #[cfg(not(windows))]
        let ok = std::process::Command::new("kill")
            .args([if paused { "-STOP" } else { "-CONT" }, &process.pid.to_string()])
            .status()
            .is_ok_and(|s| s.success());
        if ok {
            return Ok(());
        }
        let action = if paused { "menjeda" } else { "melanjutkan" };
        Err(format!("Gagal {action} proses agen (PID {}).", process.pid))
    }
}

/// Cadangan bila Job Object tidak tersedia: bunuh pohon proses via PID.
fn kill_tree(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    let status = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .status()
    };
    #[cfg(not(windows))]
    let status = std::process::Command::new("kill").args(["-9", &pid.to_string()]).status();
    status.map(|_| ()).map_err(|e| format!("Gagal menghentikan proses agen: {e}"))
}

#[tauri::command]
pub fn stop_agent_session(processes: State<'_, HeadlessProcesses>, session_id: String) -> Result<(), String> {
    processes.stop(&session_id, None)
}

#[tauri::command]
pub fn pause_agent_session(processes: State<'_, HeadlessProcesses>, session_id: String) -> Result<(), String> {
    processes.set_paused(&session_id, true)
}

#[tauri::command]
pub fn resume_agent_session(processes: State<'_, HeadlessProcesses>, session_id: String) -> Result<(), String> {
    processes.set_paused(&session_id, false)
}
