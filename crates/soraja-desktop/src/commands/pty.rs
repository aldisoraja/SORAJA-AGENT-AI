//! Mode Terminal: menjalankan CLI agen native di dalam ConPTY (portable-pty).
//! Kontrak: specs/ipc-contracts.md §1.
//!
//! Aturan konkurensi (mencegah terminal beku):
//! - Thread `wait()` memiliki `Child` sendiri; kill memakai `ChildKiller` terpisah,
//!   sehingga tidak ada mutex yang dipegang selama proses hidup.
//! - Kunci peta sesi hanya dipegang sebentar; I/O dilakukan setelah kunci dilepas.
//! - `start_interactive_pty` idempoten per `session_id`, dan `pty:exit` hanya dikirim
//!   untuk proses yang masih menjadi pemilik sesi (generasi sama).
//! - Command `async` agar tidak berjalan di thread utama UI.
//!
//! Ketahanan terhadap reload webview:
//! - Setiap sesi menyimpan riwayat output (`Scrollback`, maks. `SCROLLBACK_MAX_BYTES`) dan setiap
//!   event `pty:output` membawa `seq` (total byte sejak awal). `attach_interactive_pty` mengembalikan
//!   snapshot + `endSeq` sehingga UI yang baru dimuat bisa menyambung ke CLI yang masih hidup tanpa
//!   kehilangan atau menggandakan output.

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

static GENERATION: AtomicU64 = AtomicU64::new(1);

/// Batas riwayat output per sesi (cukup untuk beberapa layar TUI penuh + riwayat terbaru).
const SCROLLBACK_MAX_BYTES: usize = 512 * 1024;

/// Riwayat output sesi. `total` = jumlah byte kumulatif yang pernah dihasilkan (tidak berkurang saat dipangkas).
#[derive(Default)]
pub struct Scrollback {
    data: String,
    total: u64,
}

impl Scrollback {
    /// Menambah output baru; mengembalikan `total` setelah penambahan.
    pub fn push(&mut self, chunk: &str) -> u64 {
        self.data.push_str(chunk);
        self.total += chunk.len() as u64;
        if self.data.len() > SCROLLBACK_MAX_BYTES {
            let mut cut = self.data.len() - SCROLLBACK_MAX_BYTES;
            while !self.data.is_char_boundary(cut) {
                cut += 1;
            }
            // Mulai dari baris utuh berikutnya agar escape sequence di awal tidak terpotong.
            if let Some(nl) = self.data[cut..].find('\n').filter(|i| *i < 4096) {
                cut += nl + 1;
            }
            self.data.drain(..cut);
        }
        self.total
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyAttach {
    /// Apakah sesi masih terdaftar (proses hidup).
    pub alive: bool,
    /// Riwayat output saat ini (kosong bila sesi tidak ada).
    pub data: String,
    /// `seq` terakhir yang tercakup di `data`; event `pty:output` dengan `seq <= endSeq` sudah termasuk.
    pub end_seq: u64,
}

pub struct PtySession {
    generation: u64,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    scrollback: Arc<Mutex<Scrollback>>,
}

type SessionMap = Arc<Mutex<HashMap<String, PtySession>>>;

#[derive(Default)]
pub struct PtyState {
    sessions: SessionMap,
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: if rows == 0 { 24 } else { rows },
        cols: if cols == 0 { 100 } else { cols },
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// Mendekode byte UTF-8 dari PTY tanpa merusak karakter multi-byte yang terpotong
/// di batas buffer (mis. garis box-drawing TUI). Sisa byte yang belum lengkap tetap di `pending`.
pub fn drain_utf8(pending: &mut Vec<u8>) -> String {
    let mut out = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(s) => {
                out.push_str(s);
                pending.clear();
                return out;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(std::str::from_utf8(&pending[..valid]).unwrap_or_default());
                match e.error_len() {
                    None => {
                        pending.drain(..valid); // tail belum lengkap → tunggu chunk berikutnya
                        return out;
                    }
                    Some(len) => {
                        out.push('\u{FFFD}');
                        pending.drain(..valid + len);
                    }
                }
            }
        }
    }
}

/// Resolusi biner CLI + unwrap shim npm `.cmd/.bat` menjadi `node <target.js>`
/// agar ConPTY menjalankan proses asli (bukan cmd.exe perantara).
fn resolve_command(agent_executable: &str, agent_args: Vec<String>) -> (String, Vec<String>) {
    let (is_installed, found_path) = soraja_core::agent_catalog::detect_cli(agent_executable);
    let bin = if is_installed {
        found_path.unwrap_or_else(|| agent_executable.to_string())
    } else {
        agent_executable.to_string()
    };
    soraja_core::agent_catalog::resolve_cli_launch(&bin, agent_args.clone()).unwrap_or((bin, agent_args))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_interactive_pty(
    app: AppHandle,
    state: State<'_, PtyState>,
    session_id: String,
    agent_executable: String,
    agent_args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    envs: Option<HashMap<String, String>>,
) -> Result<(), String> {
    // Idempoten: spawn ganda untuk sesi yang sama (mis. React StrictMode) diabaikan.
    if state.sessions.lock().map_err(|e| e.to_string())?.contains_key(&session_id) {
        return Ok(());
    }

    let pair = native_pty_system()
        .openpty(pty_size(cols, rows))
        .map_err(|e| format!("Gagal inisialisasi PTY: {}", e))?;

    let (bin, args) = resolve_command(&agent_executable, agent_args);
    let mut cmd = CommandBuilder::new(&bin);
    if !cwd.trim().is_empty() {
        cmd.cwd(&cwd);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    for (k, v) in envs.unwrap_or_default() {
        cmd.env(k, v);
    }
    for arg in &args {
        cmd.arg(arg);
    }

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Gagal spawn CLI di PTY: {}", e))?;
    // Aman di-drop: pseudo-console tetap hidup selama `master` dipegang (pola resmi portable-pty).
    drop(pair.slave);

    let killer = child.clone_killer();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Gagal clone PTY reader: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Gagal ambil PTY writer: {}", e))?;

    let generation = GENERATION.fetch_add(1, Ordering::Relaxed);
    let scrollback = Arc::new(Mutex::new(Scrollback::default()));
    {
        let mut map = state.sessions.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&session_id) {
            // Kalah balapan dengan spawn lain untuk sesi yang sama → hentikan proses ini.
            let mut k = killer;
            let _ = k.kill();
            return Ok(());
        }
        map.insert(
            session_id.clone(),
            PtySession {
                generation,
                master: Arc::new(Mutex::new(pair.master)),
                writer: Arc::new(Mutex::new(writer)),
                killer,
                scrollback: Arc::clone(&scrollback),
            },
        );
    }

    let sid_out = session_id.clone();
    let app_out = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            pending.extend_from_slice(&buf[..n]);
            let data = drain_utf8(&mut pending);
            if !data.is_empty() {
                // Emit di dalam kunci: urutan event identik dengan urutan di riwayat (untuk dedupe via `seq`).
                if let Ok(mut sb) = scrollback.lock() {
                    let seq = sb.push(&data);
                    let _ = app_out.emit(
                        "pty:output",
                        serde_json::json!({ "sessionId": sid_out, "data": data, "seq": seq }),
                    );
                }
            }
        }
    });

    let sessions = Arc::clone(&state.sessions);
    std::thread::spawn(move || {
        // `child` dimiliki penuh thread ini: tidak ada mutex yang tertahan selama menunggu.
        let exit_code = child.wait().map(|s| s.exit_code() as i64).unwrap_or(-1);
        let still_owner = match sessions.lock() {
            Ok(mut map) => {
                let owned = map.get(&session_id).map(|s| s.generation == generation).unwrap_or(false);
                if owned {
                    map.remove(&session_id);
                }
                owned
            }
            Err(_) => false,
        };
        if still_owner {
            let _ = app.emit("pty:exit", serde_json::json!({ "sessionId": session_id, "exitCode": exit_code }));
        }
    });

    Ok(())
}

/// Menyambungkan UI (mis. setelah reload webview) ke sesi yang masih hidup: mengembalikan riwayat output.
#[tauri::command]
pub async fn attach_interactive_pty(state: State<'_, PtyState>, session_id: String) -> Result<PtyAttach, String> {
    let scrollback = {
        let map = state.sessions.lock().map_err(|e| e.to_string())?;
        map.get(&session_id).map(|s| Arc::clone(&s.scrollback))
    };
    let Some(scrollback) = scrollback else {
        return Ok(PtyAttach { alive: false, data: String::new(), end_seq: 0 });
    };
    let sb = scrollback.lock().map_err(|e| e.to_string())?;
    Ok(PtyAttach { alive: true, data: sb.data.clone(), end_seq: sb.total })
}

#[tauri::command]
pub async fn write_interactive_pty(
    state: State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let writer = {
        let map = state.sessions.lock().map_err(|e| e.to_string())?;
        match map.get(&session_id) {
            Some(s) => Arc::clone(&s.writer),
            None => return Err(format!("Sesi terminal '{}' tidak aktif", session_id)),
        }
    };
    let mut w = writer.lock().map_err(|e| e.to_string())?;
    w.write_all(data.as_bytes()).map_err(|e| format!("Gagal menulis ke PTY: {}", e))?;
    w.flush().map_err(|e| format!("Gagal flush PTY: {}", e))
}

#[tauri::command]
pub async fn resize_interactive_pty(
    state: State<'_, PtyState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let master = {
        let map = state.sessions.lock().map_err(|e| e.to_string())?;
        match map.get(&session_id) {
            Some(s) => Arc::clone(&s.master),
            None => return Ok(()),
        }
    };
    let m = master.lock().map_err(|e| e.to_string())?;
    m.resize(pty_size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_interactive_pty(state: State<'_, PtyState>, session_id: String) -> Result<(), String> {
    // Lepas kunci peta dulu, baru kill → tidak ada deadlock dengan thread wait/write.
    let session = state.sessions.lock().map_err(|e| e.to_string())?.remove(&session_id);
    if let Some(mut s) = session {
        let _ = s.killer.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{drain_utf8, Scrollback, SCROLLBACK_MAX_BYTES};

    #[test]
    fn scrollback_dipangkas_tapi_total_tetap_naik() {
        let mut sb = Scrollback::default();
        let line = "─ baris output\n".repeat(1000);
        let mut last = 0;
        for _ in 0..100 {
            last = sb.push(&line);
        }
        assert!(sb.data.len() <= SCROLLBACK_MAX_BYTES);
        assert_eq!(last, (line.len() * 100) as u64);
        assert!(sb.data.starts_with('─')); // dipangkas di batas karakter & baris
    }

    #[test]
    fn utf8_terpotong_di_batas_buffer_tidak_rusak() {
        let bytes = "─╮ halo".as_bytes();
        let mut pending = bytes[..2].to_vec(); // potongan karakter '─' (3 byte)
        assert_eq!(drain_utf8(&mut pending), "");
        pending.extend_from_slice(&bytes[2..]);
        assert_eq!(drain_utf8(&mut pending), "─╮ halo");
        assert!(pending.is_empty());
    }

    #[test]
    fn byte_invalid_diganti_replacement_char() {
        let mut pending = vec![b'a', 0xFF, b'b'];
        assert_eq!(drain_utf8(&mut pending), "a\u{FFFD}b");
    }
}
