//! Mode Chat GUI: menjalankan CLI agen secara headless dan mengalirkan stdout NDJSON.
//! Kontrak: specs/ipc-contracts.md §2, format stream: specs/agent-protocols.md §3.

use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn spawn_headless_agent(
    app: AppHandle,
    session_id: String,
    agent: String,
    agent_executable: String,
    agent_args: Vec<String>,
    cwd: String,
    envs: HashMap<String, String>,
) -> Result<(), String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let (is_installed, found_path) = soraja_core::agent_catalog::detect_cli(&agent_executable);
    let bin_to_run = if is_installed {
        found_path.unwrap_or_else(|| agent_executable.clone())
    } else {
        agent_executable.clone()
    };

    // Shim npm dibuka ke biner aslinya: lewat `cmd.exe /c`, prompt multi-baris terpotong di baris
    // pertama dan karakter `" & | % < >` bisa diartikan sebagai operator shell.
    let mut cmd = match soraja_core::agent_catalog::resolve_cli_launch(&bin_to_run, agent_args.clone()) {
        Some((bin, args)) => {
            let mut c = Command::new(bin);
            c.args(args);
            c
        }
        None => {
            let mut c = Command::new("cmd.exe");
            c.arg("/c").arg(&bin_to_run).args(&agent_args);
            c
        }
    };
    cmd.current_dir(&cwd)
        .envs(&envs)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Berjalan di latar belakang tanpa jendela konsol di Windows
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Gagal spawn {}: {}", agent_executable, e))?;
    let pid = child.id().unwrap_or(0);

    let _ = app.emit(
        "agent:session_start",
        serde_json::json!({
            "sessionId": session_id,
            "agent": agent,
            "executable": bin_to_run,
            "pid": pid,
        }),
    );

    let stdout = child.stdout.take().ok_or("stdout CLI tidak tersedia")?;
    let stderr = child.stderr.take().ok_or("stderr CLI tidak tersedia")?;

    type CliStream = Box<dyn tokio::io::AsyncRead + Unpin + Send>;
    let streams: [CliStream; 2] = [Box::new(stdout), Box::new(stderr)];
    for stream in streams {
        let sid = session_id.clone();
        let app_stream = app.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stream).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_stream.emit(
                    "agent:token_stream",
                    serde_json::json!({ "sessionId": sid, "chunk": format!("{}\n", line) }),
                );
            }
        });
    }

    let sid_end = session_id.clone();
    tokio::spawn(async move {
        let exit_code = child
            .wait()
            .await
            .map(|s| s.code().unwrap_or(0))
            .unwrap_or(-1);
        // Permintaan izin yang belum dijawab tidak lagi berarti: modal ditutup UI, CLI sudah selesai.
        crate::commands::permission_bridge::cancel_session(&app, &sid_end);
        let _ = app.emit(
            "agent:session_end",
            serde_json::json!({
                "sessionId": sid_end,
                "exitCode": exit_code,
                "summary": format!("Agen selesai dengan kode: {}", exit_code),
            }),
        );
    });

    Ok(())
}

#[tauri::command]
pub fn stop_agent_session(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    let status = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .status()
    };
    #[cfg(not(windows))]
    let status = std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status();
    status.map(|_| ()).map_err(|e| e.to_string())
}

/// Menjeda/melanjutkan proses via NtSuspendProcess / NtResumeProcess (P/Invoke PowerShell).
#[cfg(windows)]
fn nt_process_call(pid: u32, func: &str) -> Result<(), String> {
    let script = format!(
        "$src = @\"\nusing System;\nusing System.Runtime.InteropServices;\npublic class W32 {{ [DllImport(\\\"kernel32.dll\\\")] public static extern IntPtr OpenProcess(uint a, bool b, uint c); [DllImport(\\\"ntdll.dll\\\")] public static extern int {func}(IntPtr h); [DllImport(\\\"kernel32.dll\\\")] public static extern bool CloseHandle(IntPtr h); }}\n\"@; Add-Type -TypeDefinition $src; $h = [W32]::OpenProcess(0x0800, $false, {pid}); if ($h -ne [IntPtr]::Zero) {{ [W32]::{func}($h); [W32]::CloseHandle($h); }}",
    );
    use std::os::windows::process::CommandExt;
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .status()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pause_agent_session(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    return nt_process_call(pid, "NtSuspendProcess");
    #[cfg(not(windows))]
    std::process::Command::new("kill")
        .args(["-STOP", &pid.to_string()])
        .status()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resume_agent_session(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    return nt_process_call(pid, "NtResumeProcess");
    #[cfg(not(windows))]
    std::process::Command::new("kill")
        .args(["-CONT", &pid.to_string()])
        .status()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
