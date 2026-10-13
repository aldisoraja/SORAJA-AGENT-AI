use anyhow::Result;
use regex::Regex;
use std::process::Stdio;
use tokio::process::Command;

/// Sistem Pengeksekusi Terminal (MCP Tool)
pub struct TerminalExecutor {
    worktree_path: String,
}

impl TerminalExecutor {
    pub fn new(worktree_path: &str) -> Self {
        Self {
            worktree_path: worktree_path.to_string(),
        }
    }
    
    /// Pengecekan Human-in-the-Loop (HITL) Guardrails.
    /// Mengembalikan nilai `true` jika perintah terdeteksi sebagai destruktif.
    pub fn is_destructive_command(cmd: &str) -> bool {
        // Daftar pola berbahaya yang biasa digunakan secara tidak sengaja oleh LLM
        let patterns = [
            r"rm\s+-rf\s+[/\\~]",           // Menghapus sistem
            r"del\s+/s\s+/q\s+C:\\",        // Menghapus drive C
            r"Format-Volume",               // Memformat partisi
            r"Remove-Item\s+-Recurse.*C:\\",// PowerShell penghapus sistem
            r">\s*/dev/sd[a-z]",            // Overwrite disk Linux/Unix (just in case)
        ];
        
        for pattern in patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(cmd) {
                    return true;
                }
            }
        }
        false
    }
    
    /// Mengeksekusi command secara asynchronous di dalam isolasi direktori agen
    pub async fn run_command(&self, cmd: &str) -> Result<String> {
        // Pada Windows, kita secara spesifik mengeksekusi via PowerShell agar kompatibilitas terjamin
        let mut command = Command::new("powershell");
        command
            .args(["-NoProfile", "-NonInteractive", "-Command"])
            .arg(cmd)
            .current_dir(&self.worktree_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Aplikasi GUI tanpa konsol: tanpa flag ini setiap perintah memunculkan jendela terminal sekilas.
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let output = command.output().await?;
            
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        if !output.status.success() {
            // Gabungkan stdout & stderr jika terjadi error agar LLM bisa memahami letak kesalahannya
            Ok(format!("Terminal Error [Code: {}]:\n{}\n{}", 
                output.status.code().unwrap_or(-1), 
                stderr.trim(), 
                stdout.trim()
            ))
        } else {
            Ok(stdout.trim().to_string())
        }
    }
}
